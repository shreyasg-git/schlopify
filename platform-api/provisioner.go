package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/remotecommand"
)

// Provisioner holds the Kubernetes client and REST config.
type Provisioner struct {
	client *kubernetes.Clientset
	config *rest.Config
}

// NewProvisioner creates a new provisioner. It tries in-cluster config first,
// then falls back to the default kubeconfig for local development.
func NewProvisioner() (*Provisioner, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
		log.Println("Not running in-cluster, falling back to kubeconfig")
		config, err = clientcmd.BuildConfigFromFlags("", clientcmd.RecommendedHomeFile)
		if err != nil {
			return nil, fmt.Errorf("failed to build kubeconfig: %w", err)
		}
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create k8s client: %w", err)
	}

	return &Provisioner{client: clientset, config: config}, nil
}

// ProvisionShop creates the entire tenant stack in Kubernetes.
//
// Architecture (post-HPA refactor):
//
//	┌─── Pod ──────────┐
//	│ PostgreSQL :5432  │  ← standalone, no sidecar
//	└──────────────────┘
//	         ↓ shop-db-svc (ClusterIP)
//	┌─── Deployment ────┐
//	│ PostgREST (×1→×5) │  ← HPA-managed, connects via Service DNS
//	└───────────────────┘
//	         ↓ shop-api (ClusterIP)
//	┌─── Deployment ────┐
//	│ Frontend (NGINX)   │
//	└───────────────────┘
func (p *Provisioner) ProvisionShop(namespace, shopID, theme, host, frontendImage string) error {
	ctx := context.Background()

	// Step 1: Create namespace
	log.Printf("[%s] Creating namespace...", shopID)
	if err := p.createNamespace(ctx, namespace, shopID); err != nil {
		return fmt.Errorf("namespace creation failed: %w", err)
	}

	// Step 2: Create the database pod (PostgreSQL ONLY — no sidecar)
	log.Printf("[%s] Creating database pod...", shopID)
	if err := p.createDatabasePod(ctx, namespace); err != nil {
		return fmt.Errorf("database pod creation failed: %w", err)
	}

	// Step 3: Create internal service exposing PostgreSQL to PostgREST
	log.Printf("[%s] Creating database service...", shopID)
	if err := p.createDatabaseService(ctx, namespace); err != nil {
		return fmt.Errorf("database service creation failed: %w", err)
	}

	// Step 4: Wait for the database pod to be ready
	log.Printf("[%s] Waiting for database pod readiness...", shopID)
	if err := p.waitForPod(ctx, namespace, "shop-db", 120*time.Second); err != nil {
		return fmt.Errorf("database pod not ready: %w", err)
	}

	// Step 5: Initialize the database schema
	log.Printf("[%s] Initialising database schema...", shopID)
	if err := p.initDatabase(ctx, namespace); err != nil {
		return fmt.Errorf("database init failed: %w", err)
	}

	// Step 6: Create PostgREST deployment (connects via Service DNS, not localhost)
	log.Printf("[%s] Creating PostgREST deployment...", shopID)
	if err := p.createPostgRESTDeployment(ctx, namespace); err != nil {
		return fmt.Errorf("postgrest deployment creation failed: %w", err)
	}

	// Step 7: Create shop-api service (exposes PostgREST to ingress)
	log.Printf("[%s] Creating API service...", shopID)
	if err := p.createAPIService(ctx, namespace); err != nil {
		return fmt.Errorf("api service creation failed: %w", err)
	}

	// Step 8: Create HPA for PostgREST
	log.Printf("[%s] Creating HPA for PostgREST...", shopID)
	if err := p.createPostgRESTHPA(ctx, namespace); err != nil {
		return fmt.Errorf("hpa creation failed: %w", err)
	}

	// Step 9: Create frontend deployment (with theme env var)
	log.Printf("[%s] Creating frontend deployment (theme=%s)...", shopID, theme)
	if err := p.createFrontendDeployment(ctx, namespace, theme, frontendImage); err != nil {
		return fmt.Errorf("frontend deployment creation failed: %w", err)
	}

	// Step 10: Create frontend service
	log.Printf("[%s] Creating frontend service...", shopID)
	if err := p.createFrontendService(ctx, namespace); err != nil {
		return fmt.Errorf("frontend service creation failed: %w", err)
	}

	// Step 11: Create ingress rules
	log.Printf("[%s] Creating ingress...", shopID)
	if err := p.createIngress(ctx, namespace, shopID, host); err != nil {
		return fmt.Errorf("ingress creation failed: %w", err)
	}

	log.Printf("[%s] ✅ Provisioning complete!", shopID)
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Kubernetes Resource Creation
// ──────────────────────────────────────────────────────────────────────────────

func (p *Provisioner) createNamespace(ctx context.Context, namespace, shopID string) error {
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: namespace,
			Labels: map[string]string{
				"tenant":     shopID,
				"managed-by": "schlopify-platform",
			},
		},
	}
	_, err := p.client.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	return err
}

// createDatabasePod creates a pod with ONLY PostgreSQL.
// PostgREST is no longer a sidecar — it runs as a separate Deployment.
func (p *Provisioner) createDatabasePod(ctx context.Context, namespace string) error {
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-db",
			Namespace: namespace,
			Labels:    map[string]string{"app": "shop-db"},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:  "postgres",
					Image: "postgres:15-alpine",
					Ports: []corev1.ContainerPort{{ContainerPort: 5432}},
					Env: []corev1.EnvVar{
						{Name: "POSTGRES_DB", Value: "shopdb"},
						{Name: "POSTGRES_USER", Value: "shopuser"},
						{Name: "POSTGRES_PASSWORD", Value: "shoppass"},
					},
					ReadinessProbe: &corev1.Probe{
						ProbeHandler: corev1.ProbeHandler{
							Exec: &corev1.ExecAction{
								Command: []string{"pg_isready", "-U", "shopuser", "-d", "shopdb"},
							},
						},
						InitialDelaySeconds: 5,
						PeriodSeconds:       5,
					},
				},
			},
		},
	}
	_, err := p.client.CoreV1().Pods(namespace).Create(ctx, pod, metav1.CreateOptions{})
	return err
}

// createDatabaseService exposes PostgreSQL internally so PostgREST can reach it
// via DNS (shop-db-svc:5432) instead of localhost.
func (p *Provisioner) createDatabaseService(ctx context.Context, namespace string) error {
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-db-svc",
			Namespace: namespace,
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "shop-db"},
			Ports: []corev1.ServicePort{
				{
					Name:       "postgres",
					Port:       5432,
					TargetPort: intstr.FromInt(5432),
				},
			},
			Type: corev1.ServiceTypeClusterIP,
		},
	}
	_, err := p.client.CoreV1().Services(namespace).Create(ctx, svc, metav1.CreateOptions{})
	return err
}

// createPostgRESTDeployment creates PostgREST as a standalone Deployment.
// It connects to PostgreSQL via the shop-db-svc Service (not localhost).
// This allows HPA to scale PostgREST replicas independently of the database.
func (p *Provisioner) createPostgRESTDeployment(ctx context.Context, namespace string) error {
	replicas := int32(1)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-postgrest",
			Namespace: namespace,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": "shop-postgrest"},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{"app": "shop-postgrest"},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "postgrest",
							Image: "postgrest/postgrest:v12.0.2",
							Ports: []corev1.ContainerPort{{ContainerPort: 3000}},
							Env: []corev1.EnvVar{
								// Key change: connects via Service DNS, not localhost
								{Name: "PGRST_DB_URI", Value: "postgres://shopuser:shoppass@shop-db-svc:5432/shopdb"},
								{Name: "PGRST_DB_SCHEMA", Value: "public"},
								{Name: "PGRST_DB_ANON_ROLE", Value: "shopuser"},
								{Name: "PGRST_SERVER_PORT", Value: "3000"},
							},
							// Resource requests are REQUIRED for HPA to calculate
							// CPU utilization percentages.
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("50m"),
									corev1.ResourceMemory: resource.MustParse("64Mi"),
								},
								Limits: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("200m"),
									corev1.ResourceMemory: resource.MustParse("128Mi"),
								},
							},
						},
					},
				},
			},
		},
	}
	_, err := p.client.AppsV1().Deployments(namespace).Create(ctx, dep, metav1.CreateOptions{})
	return err
}

// createAPIService exposes PostgREST (now a Deployment) to the ingress layer.
func (p *Provisioner) createAPIService(ctx context.Context, namespace string) error {
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-api",
			Namespace: namespace,
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "shop-postgrest"},
			Ports: []corev1.ServicePort{
				{
					Name:       "http",
					Port:       3000,
					TargetPort: intstr.FromInt(3000),
				},
			},
			Type: corev1.ServiceTypeClusterIP,
		},
	}
	_, err := p.client.CoreV1().Services(namespace).Create(ctx, svc, metav1.CreateOptions{})
	return err
}

// createPostgRESTHPA creates a HorizontalPodAutoscaler targeting the PostgREST
// Deployment. Scales between 1-5 replicas based on CPU utilization.
//
// When traffic spikes (e.g. flash sale), CPU on PostgREST rises as it parses
// more HTTP requests and serializes more JSON. HPA detects this and spins up
// additional replicas. All replicas connect to the same PostgreSQL instance
// via the shop-db-svc Service.
func (p *Provisioner) createPostgRESTHPA(ctx context.Context, namespace string) error {
	minReplicas := int32(1)
	maxReplicas := int32(10)
	targetCPU := int32(50) // scale up when average CPU > 50% of request

	hpa := &autoscalingv2.HorizontalPodAutoscaler{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-postgrest-hpa",
			Namespace: namespace,
		},
		Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
			ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
				APIVersion: "apps/v1",
				Kind:       "Deployment",
				Name:       "shop-postgrest",
			},
			MinReplicas: &minReplicas,
			MaxReplicas: maxReplicas,
			Metrics: []autoscalingv2.MetricSpec{
				{
					Type: autoscalingv2.ResourceMetricSourceType,
					Resource: &autoscalingv2.ResourceMetricSource{
						Name: corev1.ResourceCPU,
						Target: autoscalingv2.MetricTarget{
							Type:               autoscalingv2.UtilizationMetricType,
							AverageUtilization: &targetCPU,
						},
					},
				},
			},
		},
	}
	_, err := p.client.AutoscalingV2().HorizontalPodAutoscalers(namespace).Create(ctx, hpa, metav1.CreateOptions{})
	return err
}

func (p *Provisioner) createFrontendDeployment(ctx context.Context, namespace, theme, image string) error {
	replicas := int32(1)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-frontend",
			Namespace: namespace,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": "shop-frontend"},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{"app": "shop-frontend"},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:            "frontend",
							Image:           image,
							ImagePullPolicy: corev1.PullIfNotPresent,
							Ports:           []corev1.ContainerPort{{ContainerPort: 80}},
							Env: []corev1.EnvVar{
								{Name: "SHOP_THEME", Value: theme},
							},
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/",
										Port: intstr.FromInt(80),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       5,
							},
						},
					},
				},
			},
		},
	}
	_, err := p.client.AppsV1().Deployments(namespace).Create(ctx, dep, metav1.CreateOptions{})
	return err
}

func (p *Provisioner) createFrontendService(ctx context.Context, namespace string) error {
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-frontend",
			Namespace: namespace,
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "shop-frontend"},
			Ports: []corev1.ServicePort{
				{
					Name:       "http",
					Port:       80,
					TargetPort: intstr.FromInt(80),
				},
			},
			Type: corev1.ServiceTypeClusterIP,
		},
	}
	_, err := p.client.CoreV1().Services(namespace).Create(ctx, svc, metav1.CreateOptions{})
	return err
}

func (p *Provisioner) createIngress(ctx context.Context, namespace, shopID, host string) error {
	pathTypePrefix := networkingv1.PathTypePrefix
	pathTypeImpl := networkingv1.PathTypeImplementationSpecific
	ingressClass := "nginx"

	// Ingress 1: API — strips /api prefix before forwarding to PostgREST
	apiIngress := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-ingress-api",
			Namespace: namespace,
			Annotations: map[string]string{
				"nginx.ingress.kubernetes.io/rewrite-target": "/$2",
			},
		},
		Spec: networkingv1.IngressSpec{
			IngressClassName: &ingressClass,
			Rules: []networkingv1.IngressRule{
				{
					Host: host,
					IngressRuleValue: networkingv1.IngressRuleValue{
						HTTP: &networkingv1.HTTPIngressRuleValue{
							Paths: []networkingv1.HTTPIngressPath{
								{
									Path:     "/api(/|$)(.*)",
									PathType: &pathTypeImpl,
									Backend: networkingv1.IngressBackend{
										Service: &networkingv1.IngressServiceBackend{
											Name: "shop-api",
											Port: networkingv1.ServiceBackendPort{Number: 3000},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	_, err := p.client.NetworkingV1().Ingresses(namespace).Create(ctx, apiIngress, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("api ingress: %w", err)
	}

	// Ingress 2: Frontend — serves static assets and SPA
	frontendIngress := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-ingress-frontend",
			Namespace: namespace,
		},
		Spec: networkingv1.IngressSpec{
			IngressClassName: &ingressClass,
			Rules: []networkingv1.IngressRule{
				{
					Host: host,
					IngressRuleValue: networkingv1.IngressRuleValue{
						HTTP: &networkingv1.HTTPIngressRuleValue{
							Paths: []networkingv1.HTTPIngressPath{
								{
									Path:     "/",
									PathType: &pathTypePrefix,
									Backend: networkingv1.IngressBackend{
										Service: &networkingv1.IngressServiceBackend{
											Name: "shop-frontend",
											Port: networkingv1.ServiceBackendPort{Number: 80},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	_, err = p.client.NetworkingV1().Ingresses(namespace).Create(ctx, frontendIngress, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("frontend ingress: %w", err)
	}

	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Wait & Init
// ──────────────────────────────────────────────────────────────────────────────

func (p *Provisioner) waitForPod(ctx context.Context, namespace, podName string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		pod, err := p.client.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
		if err == nil {
			for _, cond := range pod.Status.Conditions {
				if cond.Type == corev1.PodReady && cond.Status == corev1.ConditionTrue {
					return nil
				}
			}
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("pod %s/%s not ready after %v", namespace, podName, timeout)
}

func (p *Provisioner) initDatabase(ctx context.Context, namespace string) error {
	initSQL := `
CREATE TABLE IF NOT EXISTS products (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) DEFAULT 0.00,
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  product_id INT REFERENCES products(id) ON DELETE CASCADE,
  quantity INT DEFAULT 1,
  UNIQUE(session_id, product_id)
);

CREATE OR REPLACE VIEW cart_details AS
SELECT c.id, c.session_id, c.quantity, p.id as product_id, p.name, p.price, p.image_url
FROM cart_items c JOIN products p ON c.product_id = p.id;

INSERT INTO products (name, price, description, image_url) VALUES
  ('Classic Tee', 29.99, 'A timeless wardrobe essential', 'https://picsum.photos/seed/p1/400/400'),
  ('Urban Hoodie', 59.99, 'Streetwear meets comfort', 'https://picsum.photos/seed/p2/400/400'),
  ('Minimal Sneakers', 89.99, 'Clean lines, premium leather', 'https://picsum.photos/seed/p3/400/400'),
  ('Canvas Tote', 24.99, 'Everyday carry, ethically made', 'https://picsum.photos/seed/p4/400/400'),
  ('Leather Wallet', 45.00, 'Slim profile bifold wallet', 'https://picsum.photos/seed/p5/400/400'),
  ('Vintage Watch', 120.00, 'Analog watch with leather strap', 'https://picsum.photos/seed/p6/400/400'),
  ('Aviator Sunglasses', 35.50, 'Polarized UV protection', 'https://picsum.photos/seed/p7/400/400'),
  ('Denim Jacket', 75.00, 'Classic blue denim', 'https://picsum.photos/seed/p8/400/400'),
  ('Wool Beanie', 18.00, 'Warm and comfortable', 'https://picsum.photos/seed/p9/400/400'),
  ('Running Shoes', 110.00, 'Lightweight and responsive', 'https://picsum.photos/seed/p10/400/400'),
  ('Graphic T-Shirt', 25.00, '100% cotton with unique print', 'https://picsum.photos/seed/p11/400/400'),
  ('Chino Pants', 48.00, 'Tailored fit everyday wear', 'https://picsum.photos/seed/p12/400/400'),
  ('Oxford Shirt', 55.00, 'Smart casual button-down', 'https://picsum.photos/seed/p13/400/400'),
  ('Travel Backpack', 95.00, 'Water-resistant laptop sleeve', 'https://picsum.photos/seed/p14/400/400'),
  ('Wireless Earbuds', 85.00, 'Active noise cancellation', 'https://picsum.photos/seed/p15/400/400'),
  ('Sports Bottle', 15.00, 'Vacuum insulated stainless steel', 'https://picsum.photos/seed/p16/400/400'),
  ('Yoga Mat', 30.00, 'Non-slip eco-friendly material', 'https://picsum.photos/seed/p17/400/400'),
  ('Desk Lamp', 42.00, 'Adjustable LED with wireless charging', 'https://picsum.photos/seed/p18/400/400'),
  ('Coffee Mug', 12.00, 'Ceramic minimalist design', 'https://picsum.photos/seed/p19/400/400'),
  ('Mechanical Keyboard', 130.00, 'Tactile switches with RGB', 'https://picsum.photos/seed/p20/400/400')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION search_products(search_term text)
RETURNS SETOF products AS $$
  SELECT * FROM products WHERE name ILIKE '%' || search_term || '%';
$$ LANGUAGE sql STABLE;

CREATE TYPE product_stats AS (total_products int, total_characters int);

CREATE OR REPLACE FUNCTION get_stats()
RETURNS product_stats AS $$
  SELECT count(*)::int, coalesce(sum(length(name)), 0)::int FROM products;
$$ LANGUAGE sql STABLE;
`

	cmd := []string{"psql", "-U", "shopuser", "-d", "shopdb", "-c", initSQL}

	req := p.client.CoreV1().RESTClient().Post().
		Resource("pods").
		Name("shop-db").
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: "postgres",
			Command:   cmd,
			Stdin:     false,
			Stdout:    true,
			Stderr:    true,
		}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(p.config, "POST", req.URL())
	if err != nil {
		return fmt.Errorf("failed to create executor: %w", err)
	}

	var stdout, stderr bytes.Buffer
	err = exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdout: &stdout,
		Stderr: &stderr,
	})
	if err != nil {
		return fmt.Errorf("exec failed: %w (stderr: %s)", err, stderr.String())
	}

	log.Printf("[db-init] stdout: %s", stdout.String())
	if stderr.Len() > 0 {
		log.Printf("[db-init] stderr: %s", stderr.String())
	}

	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// ELK Stack Provisioning
// ──────────────────────────────────────────────────────────────────────────────

// ProvisionELKStack deploys the centralized ELK stack if it doesn't already exist.
func (p *Provisioner) ProvisionELKStack(ctx context.Context) error {
	log.Println("[ELK] Provisioning ELK Stack components...")

	namespace := "elk"
	if err := p.createNamespaceIfNotExists(ctx, namespace, "elk"); err != nil {
		return fmt.Errorf("failed to create ELK namespace: %w", err)
	}

	if err := p.createELKConfigMaps(ctx, namespace); err != nil {
		return fmt.Errorf("failed to create ELK configmaps: %w", err)
	}

	if err := p.createElasticsearch(ctx, namespace); err != nil {
		return fmt.Errorf("failed to create Elasticsearch: %w", err)
	}

	if err := p.createLogstash(ctx, namespace); err != nil {
		return fmt.Errorf("failed to create Logstash: %w", err)
	}

	if err := p.createKibana(ctx, namespace); err != nil {
		return fmt.Errorf("failed to create Kibana: %w", err)
	}

	if err := p.createFilebeat(ctx, namespace); err != nil {
		return fmt.Errorf("failed to create Filebeat: %w", err)
	}

	log.Println("[ELK] ✅ ELK Stack provisioning complete!")
	return nil
}

func (p *Provisioner) createNamespaceIfNotExists(ctx context.Context, namespace, tenant string) error {
	_, err := p.client.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{})
	if err == nil {
		return nil // already exists
	}
	if !errors.IsNotFound(err) {
		return err
	}
	return p.createNamespace(ctx, namespace, tenant)
}

func (p *Provisioner) createELKConfigMaps(ctx context.Context, namespace string) error {
	lsCM := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "logstash-pipeline", Namespace: namespace},
		Data: map[string]string{
			"logstash.conf": `input {
  beats {
    port => 5044
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch.elk.svc.cluster.local:9200"]
    index => "%{[@metadata][beat]}-%{+YYYY.MM.dd}"
  }
}`,
		},
	}
	_, err := p.client.CoreV1().ConfigMaps(namespace).Create(ctx, lsCM, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	fbCM := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "filebeat-config", Namespace: namespace},
		Data: map[string]string{
			"filebeat.yml": `filebeat.inputs:
  - type: container
    paths:
      - /var/log/containers/*.log
    exclude_files: ['.gz$']
    processors:
      - add_kubernetes_metadata:
          host: ${NODE_NAME}
          matchers:
            - logs_path:
                logs_path: "/var/log/containers"
output.logstash:
  hosts: ["logstash.elk.svc.cluster.local:5044"]
setup.kibana:
  host: "http://kibana.elk.svc.cluster.local:5601"
`,
		},
	}
	_, err = p.client.CoreV1().ConfigMaps(namespace).Create(ctx, fbCM, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	return nil
}

func (p *Provisioner) createElasticsearch(ctx context.Context, namespace string) error {
	replicas := int32(1)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "elasticsearch", Namespace: namespace},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "elasticsearch"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "elasticsearch"}},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "elasticsearch",
							Image: "docker.elastic.co/elasticsearch/elasticsearch:8.11.0",
							Env: []corev1.EnvVar{
								{Name: "discovery.type", Value: "single-node"},
								{Name: "xpack.security.enabled", Value: "false"},
								{Name: "network.host", Value: "0.0.0.0"},
								{Name: "ES_JAVA_OPTS", Value: "-Xms256m -Xmx256m"},
							},
							Ports: []corev1.ContainerPort{{ContainerPort: 9200, Name: "http"}},
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceMemory: resource.MustParse("512Mi"),
									corev1.ResourceCPU:    resource.MustParse("250m"),
								},
								Limits: corev1.ResourceList{
									corev1.ResourceMemory: resource.MustParse("1Gi"),
									corev1.ResourceCPU:    resource.MustParse("500m"),
								},
							},
						},
					},
				},
			},
		},
	}
	_, err := p.client.AppsV1().Deployments(namespace).Create(ctx, dep, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "elasticsearch", Namespace: namespace},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "elasticsearch"},
			Ports: []corev1.ServicePort{
				{Name: "http", Port: 9200, TargetPort: intstr.FromInt(9200), Protocol: corev1.ProtocolTCP},
			},
		},
	}
	_, err = p.client.CoreV1().Services(namespace).Create(ctx, svc, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

func (p *Provisioner) createLogstash(ctx context.Context, namespace string) error {
	replicas := int32(1)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "logstash", Namespace: namespace},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "logstash"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "logstash"}},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "logstash",
							Image: "docker.elastic.co/logstash/logstash:8.11.0",
							Env: []corev1.EnvVar{
								{Name: "LS_JAVA_OPTS", Value: "-Xms256m -Xmx256m"},
							},
							Ports: []corev1.ContainerPort{{ContainerPort: 5044, Name: "beats"}},
							VolumeMounts: []corev1.VolumeMount{
								{Name: "pipeline", MountPath: "/usr/share/logstash/pipeline"},
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "pipeline",
							VolumeSource: corev1.VolumeSource{
								ConfigMap: &corev1.ConfigMapVolumeSource{
									LocalObjectReference: corev1.LocalObjectReference{Name: "logstash-pipeline"},
								},
							},
						},
					},
				},
			},
		},
	}
	_, err := p.client.AppsV1().Deployments(namespace).Create(ctx, dep, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "logstash", Namespace: namespace},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "logstash"},
			Ports: []corev1.ServicePort{
				{Name: "beats", Port: 5044, TargetPort: intstr.FromInt(5044), Protocol: corev1.ProtocolTCP},
			},
		},
	}
	_, err = p.client.CoreV1().Services(namespace).Create(ctx, svc, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

func (p *Provisioner) createKibana(ctx context.Context, namespace string) error {
	replicas := int32(1)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "kibana", Namespace: namespace},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "kibana"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "kibana"}},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "kibana",
							Image: "docker.elastic.co/kibana/kibana:8.11.0",
							Env: []corev1.EnvVar{
								{Name: "ELASTICSEARCH_HOSTS", Value: "http://elasticsearch.elk.svc.cluster.local:9200"},
								{Name: "SERVER_HOST", Value: "0.0.0.0"},
							},
							Ports: []corev1.ContainerPort{{ContainerPort: 5601, Name: "http"}},
						},
					},
				},
			},
		},
	}
	_, err := p.client.AppsV1().Deployments(namespace).Create(ctx, dep, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "kibana", Namespace: namespace},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "kibana"},
			Ports: []corev1.ServicePort{
				{Name: "http", Port: 5601, TargetPort: intstr.FromInt(5601), Protocol: corev1.ProtocolTCP},
			},
		},
	}
	_, err = p.client.CoreV1().Services(namespace).Create(ctx, svc, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

func (p *Provisioner) createFilebeat(ctx context.Context, namespace string) error {
	ds := &appsv1.DaemonSet{
		ObjectMeta: metav1.ObjectMeta{Name: "filebeat", Namespace: namespace},
		Spec: appsv1.DaemonSetSpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "filebeat"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "filebeat"}},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "filebeat",
							Image: "docker.elastic.co/beats/filebeat:8.11.0",
							Args:  []string{"-e", "-c", "/usr/share/filebeat/filebeat.yml"},
							Env: []corev1.EnvVar{
								{
									Name: "NODE_NAME",
									ValueFrom: &corev1.EnvVarSource{
										FieldRef: &corev1.ObjectFieldSelector{
											FieldPath: "spec.nodeName",
										},
									},
								},
							},
							VolumeMounts: []corev1.VolumeMount{
								{Name: "config", MountPath: "/usr/share/filebeat/filebeat.yml", SubPath: "filebeat.yml"},
								{Name: "varlogcontainers", MountPath: "/var/log/containers", ReadOnly: true},
								{Name: "varlogpods", MountPath: "/var/log/pods", ReadOnly: true},
								{Name: "varlibdockercontainers", MountPath: "/var/lib/docker/containers", ReadOnly: true},
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "config",
							VolumeSource: corev1.VolumeSource{
								ConfigMap: &corev1.ConfigMapVolumeSource{
									LocalObjectReference: corev1.LocalObjectReference{Name: "filebeat-config"},
								},
							},
						},
						{
							Name: "varlogcontainers",
							VolumeSource: corev1.VolumeSource{
								HostPath: &corev1.HostPathVolumeSource{Path: "/var/log/containers"},
							},
						},
						{
							Name: "varlogpods",
							VolumeSource: corev1.VolumeSource{
								HostPath: &corev1.HostPathVolumeSource{Path: "/var/log/pods"},
							},
						},
						{
							Name: "varlibdockercontainers",
							VolumeSource: corev1.VolumeSource{
								HostPath: &corev1.HostPathVolumeSource{Path: "/var/lib/docker/containers"},
							},
						},
					},
				},
			},
		},
	}
	_, err := p.client.AppsV1().DaemonSets(namespace).Create(ctx, ds, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}
