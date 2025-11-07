# Docker Client Connections to Countly MCP Server

This guide shows how to connect various MCP clients to a Dockerized Countly MCP Server.

## Table of Contents
- [Server Deployment Options](#server-deployment-options)
- [Docker Client → Docker Server](#docker-client--docker-server)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Docker Swarm](#docker-swarm)

---

## Server Deployment Options

### Option 1: Docker Run (Simple)

```bash
docker run -d \
  --name countly-mcp-server \
  -p 3000:3000 \
  -e COUNTLY_SERVER_URL=https://your-countly-instance.com \
  -e COUNTLY_AUTH_TOKEN=your-token-here \
  countly-mcp-server
```

### Option 2: Docker Compose (Production)

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  countly-mcp-server:
    image: countly-mcp-server:latest
    container_name: countly-mcp-server
    ports:
      - "3000:3000"
    environment:
      - COUNTLY_SERVER_URL=https://your-countly-instance.com
      - COUNTLY_AUTH_TOKEN_FILE=/run/secrets/countly_token
    secrets:
      - countly_token
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
    networks:
      - countly-network

secrets:
  countly_token:
    file: ./countly_token.txt

networks:
  countly-network:
    driver: bridge
```

**countly_token.txt:**
```
your-auth-token-here
```

Start the service:
```bash
docker-compose up -d
```

### Option 3: Docker with Token File Mount

```bash
# Create token file
echo "your-token-here" > countly_token.txt
chmod 600 countly_token.txt

# Run with mounted file
docker run -d \
  --name countly-mcp-server \
  -p 3000:3000 \
  -e COUNTLY_SERVER_URL=https://your-countly-instance.com \
  -e COUNTLY_AUTH_TOKEN_FILE=/secrets/token.txt \
  -v $(pwd)/countly_token.txt:/secrets/token.txt:ro \
  countly-mcp-server
```

---

## Docker Client → Docker Server

### Same Host

Both containers on the same Docker network can communicate directly.

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  countly-mcp-server:
    image: countly-mcp-server:latest
    container_name: countly-mcp-server
    environment:
      - COUNTLY_SERVER_URL=https://your-countly-instance.com
      - COUNTLY_AUTH_TOKEN=your-token-here
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s

  mcp-client-app:
    image: your-mcp-client:latest
    container_name: mcp-client
    environment:
      - MCP_SERVER_URL=http://countly-mcp-server:3000/mcp
    depends_on:
      countly-mcp-server:
        condition: service_healthy
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

**Note**: The client uses the service name `countly-mcp-server` as hostname.

### Different Hosts

If server and client are on different hosts:

**Server Host:**
```bash
docker run -d \
  --name countly-mcp-server \
  -p 3000:3000 \
  -e COUNTLY_SERVER_URL=https://your-countly-instance.com \
  -e COUNTLY_AUTH_TOKEN=your-token-here \
  countly-mcp-server
```

**Client Host:**
```bash
docker run -d \
  --name mcp-client \
  -e MCP_SERVER_URL=http://192.168.1.100:3000/mcp \
  your-mcp-client:latest
```

Replace `192.168.1.100` with the actual server IP.

### Docker Network Connectivity Test

```bash
# From client container, test connection
docker exec mcp-client curl http://countly-mcp-server:3000/health

# Or with wget
docker exec mcp-client wget -qO- http://countly-mcp-server:3000/health
```

---

## Kubernetes Deployment

### Deployment YAML

**countly-mcp-deployment.yaml:**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: countly-token
  namespace: default
type: Opaque
stringData:
  token: "your-auth-token-here"

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: countly-mcp-config
  namespace: default
data:
  COUNTLY_SERVER_URL: "https://your-countly-instance.com"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: countly-mcp-server
  namespace: default
  labels:
    app: countly-mcp-server
spec:
  replicas: 2
  selector:
    matchLabels:
      app: countly-mcp-server
  template:
    metadata:
      labels:
        app: countly-mcp-server
    spec:
      containers:
      - name: countly-mcp-server
        image: countly-mcp-server:latest
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: COUNTLY_SERVER_URL
          valueFrom:
            configMapKeyRef:
              name: countly-mcp-config
              key: COUNTLY_SERVER_URL
        - name: COUNTLY_AUTH_TOKEN
          valueFrom:
            secretKeyRef:
              name: countly-token
              key: token
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          limits:
            memory: "512Mi"
            cpu: "500m"
          requests:
            memory: "256Mi"
            cpu: "250m"

---
apiVersion: v1
kind: Service
metadata:
  name: countly-mcp-service
  namespace: default
spec:
  selector:
    app: countly-mcp-server
  ports:
  - protocol: TCP
    port: 3000
    targetPort: 3000
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: countly-mcp-ingress
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: countly-mcp.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: countly-mcp-service
            port:
              number: 3000
```

### Deploy to Kubernetes

```bash
# Apply configuration
kubectl apply -f countly-mcp-deployment.yaml

# Check deployment status
kubectl get deployments
kubectl get pods
kubectl get services

# Check logs
kubectl logs -l app=countly-mcp-server --tail=100 -f

# Test internally
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://countly-mcp-service:3000/health
```

### Client Connection (Inside Cluster)

From another pod in the same cluster:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mcp-client-pod
spec:
  containers:
  - name: client
    image: your-mcp-client:latest
    env:
    - name: MCP_SERVER_URL
      value: "http://countly-mcp-service:3000/mcp"
```

### Client Connection (Outside Cluster)

Use the Ingress hostname or LoadBalancer IP:

```bash
# Via Ingress
MCP_SERVER_URL=http://countly-mcp.yourdomain.com/mcp

# Via LoadBalancer (if type: LoadBalancer)
kubectl get service countly-mcp-service
# Use EXTERNAL-IP
MCP_SERVER_URL=http://<EXTERNAL-IP>:3000/mcp
```

---

## Docker Swarm

### Initialize Swarm

```bash
# On manager node
docker swarm init

# Get join token for workers
docker swarm join-token worker
```

### Create Secret

```bash
echo "your-auth-token-here" | docker secret create countly_token -
```

### Deploy Stack

**docker-stack.yml:**

```yaml
version: '3.8'

services:
  countly-mcp-server:
    image: countly-mcp-server:latest
    ports:
      - "3000:3000"
    environment:
      - COUNTLY_SERVER_URL=https://your-countly-instance.com
      - COUNTLY_AUTH_TOKEN_FILE=/run/secrets/countly_token
    secrets:
      - countly_token
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      placement:
        constraints:
          - node.role == worker
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - countly-network

secrets:
  countly_token:
    external: true

networks:
  countly-network:
    driver: overlay
```

### Deploy

```bash
docker stack deploy -c docker-stack.yml countly-stack

# Check status
docker stack services countly-stack
docker stack ps countly-stack

# View logs
docker service logs countly-stack_countly-mcp-server -f

# Scale
docker service scale countly-stack_countly-mcp-server=5

# Update
docker service update --image countly-mcp-server:v2 countly-stack_countly-mcp-server

# Remove
docker stack rm countly-stack
```

### Client Connection in Swarm

From any node in the swarm:

```bash
# Service name is resolvable across the swarm
curl http://countly-mcp-server:3000/health

# Or use the stack prefix
curl http://countly-stack_countly-mcp-server:3000/health
```

---

## Networking Tips

### Port Mapping

```bash
# Standard mapping
-p 3000:3000

# Custom host port
-p 8080:3000

# Bind to specific interface
-p 127.0.0.1:3000:3000

# Multiple ports (if needed)
-p 3000:3000 -p 9090:9090
```

### Network Modes

```bash
# Bridge (default)
--network bridge

# Host (container uses host network)
--network host

# Custom network
docker network create countly-net
--network countly-net

# No network
--network none
```

### DNS Resolution

In Docker networks, containers can resolve each other by:
- Container name: `http://countly-mcp-server:3000`
- Service name (in compose): `http://countly-mcp-server:3000`
- Network aliases: Define in compose with `aliases:`

---

## Monitoring & Debugging

### Health Checks

```bash
# Check from host
curl http://localhost:3000/health

# Check from another container
docker exec other-container curl http://countly-mcp-server:3000/health

# Check in Kubernetes
kubectl exec -it pod-name -- wget -qO- http://countly-mcp-service:3000/health
```

### View Logs

```bash
# Docker
docker logs countly-mcp-server -f

# Docker Compose
docker-compose logs -f countly-mcp-server

# Kubernetes
kubectl logs -l app=countly-mcp-server -f

# Docker Swarm
docker service logs countly-stack_countly-mcp-server -f
```

### Network Inspection

```bash
# Docker network
docker network inspect bridge

# Container network settings
docker inspect countly-mcp-server --format='{{json .NetworkSettings}}'

# Test connectivity
docker run --rm --network container:countly-mcp-server curlimages/curl \
  curl http://localhost:3000/health
```

---

## Troubleshooting

### Connection Refused

```bash
# Check if container is running
docker ps | grep countly-mcp

# Check port mapping
docker port countly-mcp-server

# Check logs
docker logs countly-mcp-server

# Check network
docker network ls
docker network inspect <network-name>
```

### Firewall Issues

```bash
# Allow Docker traffic (Linux)
sudo ufw allow 3000/tcp

# Check iptables
sudo iptables -L -n | grep 3000

# Docker creates its own iptables rules
sudo iptables -L DOCKER -n
```

### DNS Resolution Fails

```bash
# Check DNS in container
docker exec countly-mcp-server nslookup other-service

# Check /etc/hosts
docker exec countly-mcp-server cat /etc/hosts

# Use IP instead of hostname
docker inspect other-container --format='{{.NetworkSettings.IPAddress}}'
```

### Health Check Fails

```bash
# Manual health check
docker exec countly-mcp-server wget -qO- http://localhost:3000/health

# Check if server is listening
docker exec countly-mcp-server netstat -tlnp | grep 3000

# Or with ss
docker exec countly-mcp-server ss -tlnp | grep 3000
```

---

## Security Best Practices

### 1. Use Secrets

```bash
# Never pass tokens as environment variables in logs
# Use Docker secrets or mounted files instead
docker secret create countly_token countly_token.txt
```

### 2. Limit Network Exposure

```bash
# Only expose to localhost if not needed externally
docker run -p 127.0.0.1:3000:3000 countly-mcp-server

# Use custom networks
docker network create --internal countly-internal
```

### 3. Run as Non-Root

Already configured in Dockerfile:
```dockerfile
USER node
```

### 4. Read-Only Filesystem

```bash
docker run --read-only \
  --tmpfs /tmp \
  countly-mcp-server
```

### 5. Resource Limits

```bash
docker run \
  --memory="256m" \
  --cpus="0.5" \
  countly-mcp-server
```

---

## Related Documentation

- [HTTP/SSE Connection Guide](./http-sse-connection.md)
- [Claude Desktop Setup](./claude-desktop-stdio.md)
- [VS Code MCP Setup](./vscode-mcp.md)
- [Cline Setup](./cline-vscode.md)
- [Full Docker Guide](../DOCKER.md)
- [Main README](../README.md)
