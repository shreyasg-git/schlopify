# Post-Mortem: Kubernetes Image Update Issue

## 1. The Problem
After updating the React frontend code locally (`App.jsx`, `index.html`, etc.), the following standard deployment commands were executed:
```bash
docker build -t platform-frontend:v2 ./platform-frontend
minikube image load platform-frontend:v2
kubectl rollout restart deployment platform-frontend -n schlopify-platform
```
Despite the commands completing successfully and the pods restarting, the browser still loaded the **old** version of the React application. 

## 2. The Root Cause: Image Tag Caching in Kubernetes

This issue is a classic Kubernetes "gotcha" related to how container runtimes (like `containerd` or `docker` inside Minikube) cache container images.

### The Timeline of Failure
1. **The Build**: We built a fresh Docker image with our new UI code. Since we used the same tag (`platform-frontend:v2`), Docker locally overwrote the old `v2` image.
2. **The Load**: We ran `minikube image load platform-frontend:v2`. This pushed the new image digest into the Minikube cluster's local registry/cache under the `v2` tag.
3. **The Restart**: We triggered a `kubectl rollout restart`. The Deployment controller spun down the old pods and scheduled new ones.
4. **The Catch**: Our deployment manifest was configured with:
   ```yaml
   image: platform-frontend:v2
   imagePullPolicy: IfNotPresent
   ```
   When the `kubelet` went to start the new pod, it looked at its local image cache. It saw that an image tagged `platform-frontend:v2` was **already present**. Because the policy was `IfNotPresent`, the kubelet opted *not* to pull or verify the digest against the registry, and instead blindly booted the stale container layer cache associated with the original `v2` tag.

> [!WARNING]
> In Minikube/Kind environments, overwriting an existing image tag and restarting the pod is not guaranteed to use the new image if the tag name remains identical. The node's container runtime often holds onto the old digest.

## 3. The Resolution

To force Kubernetes to use the newly built code, we had to ensure the Kubelet recognized the image as genuinely "new". 

### The Fix
We bumped the image tag incrementally:
1. **Updated Code & Scripts**: We modified `deploy.sh` and `k8s/deployment-platform-frontend.yaml` to reference `platform-frontend:v3`.
2. **Re-built & Re-loaded**:
   ```bash
   docker build -t platform-frontend:v3 ./platform-frontend
   minikube image load platform-frontend:v3
   ```
3. **Applied Manifest**:
   ```bash
   kubectl apply -f k8s/deployment-platform-frontend.yaml
   ```

### Why this worked
Because the deployment now requested `platform-frontend:v3`—a tag that **did not exist** in the node's cache—the `kubelet` was forced to look for it. It found our newly loaded `v3` image in the local Minikube cache, unpacked it, and successfully served the updated UI.

## 4. Best Practices Moving Forward

To prevent this in the future during local development, you have two options:

1. **Tag Bumping (What we did)**: Always increment the tag (e.g., `v2` -> `v3` -> `v4`) when pushing changes. This is the safest and most deterministic approach, matching production CI/CD workflows.
2. **Use `latest` + `Always` Pull Policy**: For rapid local iteration without changing tags, use the `latest` tag combined with a strict pull policy:
   ```yaml
   image: platform-frontend:latest
   imagePullPolicy: Always
   ```
   *Note: Even with `Always`, you still must run `minikube image load` after every build so the updated `latest` is available in the cluster's daemon.*
