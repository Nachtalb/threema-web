# Kubernetes

Plain manifests, no Helm. Stateless, one replica, read-only rootfs, non-root,
no service account token.

    kubectl apply -f k8s/configmap.yaml -f k8s/deployment.yaml \
                  -f k8s/service.yaml -f k8s/httproute.yaml

| File | What |
| --- | --- |
| `configmap.yaml` | `userconfig.overrides.js`, mounted over the file in the image |
| `deployment.yaml` | the pod; `cpu: 0` request, 64Mi limit, `/health` probes |
| `service.yaml` | ClusterIP `:80` → container `:8080` |
| `httproute.yaml` | Gateway API route via `kgw`, hosts `threema.nachtalb.ch` and `t.naa.gg` |

`httproute.yaml` is specific to a kgateway + external-dns cluster. On an
Ingress-based cluster, replace it with an `Ingress` pointing at the
`threema-web` Service on port 80; nothing else changes.

Editing the ConfigMap does not restart the pod — `kubectl rollout restart
deploy/threema-web` afterwards. Rolling a new `:latest` is the same command
(`imagePullPolicy: Always`).
