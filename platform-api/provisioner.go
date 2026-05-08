package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
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
func (p *Provisioner) ProvisionShop(namespace, shopID, theme, host, frontendImage string) error {
	ctx := context.Background()

	// Step 1: Create namespace
	log.Printf("[%s] Creating namespace...", shopID)
	if err := p.createNamespace(ctx, namespace, shopID); err != nil {
		return fmt.Errorf("namespace creation failed: %w", err)
	}

	// Step 2: Create the sidecar pod (PostgreSQL + PostgREST)
	log.Printf("[%s] Creating database pod...", shopID)
	if err := p.createDatabasePod(ctx, namespace, shopID); err != nil {
		return fmt.Errorf("database pod creation failed: %w", err)
	}

	// Step 3: Create shop-api service (exposes PostgREST)
	log.Printf("[%s] Creating API service...", shopID)
	if err := p.createAPIService(ctx, namespace); err != nil {
		return fmt.Errorf("api service creation failed: %w", err)
	}

	// Step 4: Create frontend deployment (with theme env var)
	log.Printf("[%s] Creating frontend deployment (theme=%s)...", shopID, theme)
	if err := p.createFrontendDeployment(ctx, namespace, theme, frontendImage); err != nil {
		return fmt.Errorf("frontend deployment creation failed: %w", err)
	}

	// Step 5: Create frontend service
	log.Printf("[%s] Creating frontend service...", shopID)
	if err := p.createFrontendService(ctx, namespace); err != nil {
		return fmt.Errorf("frontend service creation failed: %w", err)
	}

	// Step 6: Create ingress rules
	log.Printf("[%s] Creating ingress...", shopID)
	if err := p.createIngress(ctx, namespace, shopID, host); err != nil {
		return fmt.Errorf("ingress creation failed: %w", err)
	}

	// Step 7: Wait for the database pod to be ready
	log.Printf("[%s] Waiting for database pod readiness...", shopID)
	if err := p.waitForPod(ctx, namespace, "shop-db", 120*time.Second); err != nil {
		return fmt.Errorf("database pod not ready: %w", err)
	}

	// Step 8: Initialize the database schema
	log.Printf("[%s] Initialising database schema...", shopID)
	if err := p.initDatabase(ctx, namespace); err != nil {
		return fmt.Errorf("database init failed: %w", err)
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
				"tenant":          shopID,
				"managed-by":      "schlopify-platform",
			},
		},
	}
	_, err := p.client.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	return err
}

func (p *Provisioner) createDatabasePod(ctx context.Context, namespace, shopID string) error {
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-db",
			Namespace: namespace,
			Labels: map[string]string{
				"app": "shop-db",
			},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				// ── PostgreSQL ──
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
				// ── PostgREST (sidecar — zero-hop via localhost) ──
				{
					Name:  "postgrest",
					Image: "postgrest/postgrest:v12.0.2",
					Ports: []corev1.ContainerPort{{ContainerPort: 3000}},
					Env: []corev1.EnvVar{
						{Name: "PGRST_DB_URI", Value: "postgres://shopuser:shoppass@localhost:5432/shopdb"},
						{Name: "PGRST_DB_SCHEMA", Value: "public"},
						{Name: "PGRST_DB_ANON_ROLE", Value: "shopuser"},
						{Name: "PGRST_SERVER_PORT", Value: "3000"},
					},
				},
			},
		},
	}
	_, err := p.client.CoreV1().Pods(namespace).Create(ctx, pod, metav1.CreateOptions{})
	return err
}

func (p *Provisioner) createAPIService(ctx context.Context, namespace string) error {
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shop-api",
			Namespace: namespace,
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "shop-db"},
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

INSERT INTO products (name, price, description) VALUES
  ('Classic Tee', 29.99, 'A timeless wardrobe essential'),
  ('Urban Hoodie', 59.99, 'Streetwear meets comfort'),
  ('Minimal Sneakers', 89.99, 'Clean lines, premium leather'),
  ('Canvas Tote', 24.99, 'Everyday carry, ethically made')
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
