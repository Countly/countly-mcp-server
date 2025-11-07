# Docker Deployment Guide

This guide covers deploying Countly MCP Server using Docker in various environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Docker Hub](#docker-hub)
- [Local Build](#local-build)
- [Docker Compose](#docker-compose)
- [Docker Swarm](#docker-swarm)
- [Kubernetes](#kubernetes)
- [Configuration](#configuration)
- [Health Checks](#health-checks)
- [Troubleshooting](#troubleshooting)

## Quick Start

The fastest way to get started:

```bash
# 1. Clone and navigate to the repository
git clone https://github.com/countly/countly-mcp-server.git
cd countly-mcp-server

# 2. Run the quick start script
./docker-start.sh
```

The script will guide you through:
- Creating environment configuration
- Setting up authentication token
- Building and starting the server

## Docker Hub

### Pull from Docker Hub

```bash
docker pull countly/countly-mcp-server:latest
```

### Run from Docker Hub

```bash
docker run -d \
  --name countly-mcp-server \
  -p 3000:3000 \
  -e COUNTLY_SERVER_URL=https://your-countly-instance.com \
  -e COUNTLY_AUTH_TOKEN=your-token-here \
  countly/countly-mcp-server:latest
```

## Local Build

### Build the Image

```bash
# Build with tag
docker build -t countly-mcp-server:local .

# Build with specific version
docker build -t countly-mcp-server:1.0.0 .
```

### Run Local Image

```bash
docker run -d \
  --name countly-mcp-server \
  -p 3000:3000 \
  -e COUNTLY_SERVER_URL=https://your-countly-instance.com \
  -e COUNTLY_AUTH_TOKEN=your-token-here \
  countly-mcp-server:local
```

## Docker Compose

### Basic Setup

1. **Create token file:**
   ```bash
   echo "your-auth-token" > countly_token.txt
   chmod 600 countly_token.txt
   ```

2. **Create/edit .env file:**
   ```bash
   cp .env.example .env
   # Edit COUNTLY_SERVER_URL in .env
   ```

3. **Start services:**
   ```bash
   docker-compose up -d
   ```

### Development Setup

For development with hot reload:

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  countly-mcp-server:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ./src:/app/src:ro
      - ./package.json:/app/package.json:ro
    environment:
      - COUNTLY_SERVER_URL=${COUNTLY_SERVER_URL}
      - COUNTLY_AUTH_TOKEN=${COUNTLY_AUTH_TOKEN}
    ports:
      - "3000:3000"
    command: npm run dev
```

Run with:
```bash
docker-compose -f docker-compose.dev.yml up
```

### Production Setup with Secrets

The provided `docker-compose.yml` uses Docker secrets:

```bash
# Start with secrets
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Stop
docker-compose down
```

## Docker Swarm

### Initialize Swarm

```bash
docker swarm init
```

### Create Secret

```bash
echo "your-auth-token" | docker secret create countly_token -
```

### Deploy Stack

```bash
# Update docker-compose.yml to use external secret
# Then deploy
docker stack deploy -c docker-compose.yml countly
```

### Manage Stack

```bash
# List services
docker service ls

# View logs
docker service logs countly_countly-mcp-server

# Scale service
docker service scale countly_countly-mcp-server=3

# Remove stack
docker stack rm countly
```

## Kubernetes

### Create Namespace

```bash
kubectl create namespace countly-mcp
```

### Create Secret

```bash
kubectl create secret generic countly-token \
  --from-literal=token=your-auth-token \
  -n countly-mcp
```

### Deployment

```yaml
# kubernetes-deployment.yml
apiVersion: v1
kind: ConfigMap
metadata:
  name: countly-mcp-config
  namespace: countly-mcp
data:
  COUNTLY_SERVER_URL: "https://your-countly-instance.com"
  COUNTLY_TIMEOUT: "30000"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: countly-mcp-server
  namespace: countly-mcp
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
        image: countly/countly-mcp-server:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: COUNTLY_SERVER_URL
          valueFrom:
            configMapKeyRef:
              name: countly-mcp-config
              key: COUNTLY_SERVER_URL
        - name: COUNTLY_TIMEOUT
          valueFrom:
            configMapKeyRef:
              name: countly-mcp-config
              key: COUNTLY_TIMEOUT
        - name: COUNTLY_AUTH_TOKEN_FILE
          value: "/run/secrets/countly_token"
        volumeMounts:
        - name: token
          mountPath: /run/secrets
          readOnly: true
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
      volumes:
      - name: token
        secret:
          secretName: countly-token
          items:
          - key: token
            path: countly_token
---
apiVersion: v1
kind: Service
metadata:
  name: countly-mcp-server
  namespace: countly-mcp
spec:
  selector:
    app: countly-mcp-server
  ports:
  - name: http
    port: 3000
    targetPort: 3000
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: countly-mcp-server
  namespace: countly-mcp
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - host: countly-mcp.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: countly-mcp-server
            port:
              number: 3000
```

### Deploy to Kubernetes

```bash
kubectl apply -f kubernetes-deployment.yml

# Check status
kubectl get pods -n countly-mcp
kubectl get svc -n countly-mcp

# View logs
kubectl logs -f deployment/countly-mcp-server -n countly-mcp
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `COUNTLY_SERVER_URL` | Countly server URL | `https://api.count.ly` |
| `COUNTLY_AUTH_TOKEN` | Direct auth token | - |
| `COUNTLY_AUTH_TOKEN_FILE` | Path to token file | - |
| `COUNTLY_TIMEOUT` | Request timeout (ms) | `30000` |

### Volume Mounts

For token files or custom configurations:

```bash
docker run -d \
  -v $(pwd)/countly_token.txt:/run/secrets/countly_token:ro \
  -v $(pwd)/custom.env:/app/.env:ro \
  -e COUNTLY_AUTH_TOKEN_FILE=/run/secrets/countly_token \
  countly-mcp-server
```

## Health Checks

### Built-in Health Check

The Docker image includes a health check:

```bash
# Check container health
docker ps

# Manual health check
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-10T12:00:00.000Z"
}
```

### Custom Health Check

Override the default health check:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs countly-mcp-server

# Check if port is already in use
lsof -i :3000

# Run in foreground for debugging
docker run -it --rm \
  -p 3000:3000 \
  -e COUNTLY_SERVER_URL=https://your-instance.com \
  -e COUNTLY_AUTH_TOKEN=your-token \
  countly-mcp-server
```

### Authentication Errors

```bash
# Verify token
docker exec countly-mcp-server cat /run/secrets/countly_token

# Test token manually
curl "https://your-instance.com/o/apps/mine?auth_token=your-token"
```

### Connection Issues

```bash
# Test from container
docker exec countly-mcp-server wget -O- http://localhost:3000/health

# Check network
docker network ls
docker network inspect bridge
```

### Performance Issues

```bash
# Check resource usage
docker stats countly-mcp-server

# Increase memory limit
docker run -m 1g countly-mcp-server

# Or in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 1G
```

### Debug Mode

Run with verbose logging:

```bash
docker run -it --rm \
  -e NODE_ENV=development \
  -e DEBUG=* \
  countly-mcp-server
```

## Best Practices

1. **Use secrets** for tokens in production
2. **Enable health checks** for automatic recovery
3. **Set resource limits** to prevent resource exhaustion
4. **Use read-only mounts** for sensitive files
5. **Run as non-root user** (built into image)
6. **Enable logging** with proper rotation
7. **Use specific image tags** instead of `latest` in production
8. **Implement backup strategies** for configuration
9. **Monitor container health** with external tools
10. **Keep images updated** for security patches

## Security Considerations

### File Permissions

```bash
# Secure token file
chmod 600 countly_token.txt
chown 1001:1001 countly_token.txt  # Match container user
```

### Network Isolation

```bash
# Create isolated network
docker network create --internal countly-network

docker run --network countly-network countly-mcp-server
```

### Read-only Filesystem

```bash
docker run --read-only \
  --tmpfs /tmp \
  countly-mcp-server
```

## Monitoring

### Prometheus Metrics

Add metrics endpoint (extend the server):

```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
  
  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
```

### Log Aggregation

```yaml
logging:
  driver: "fluentd"
  options:
    fluentd-address: localhost:24224
    tag: countly-mcp-server
```

## Support

- Issues: [GitHub Issues](https://github.com/countly/countly-mcp-server/issues)
- Community: [Countly Community](https://community.count.ly)
- Documentation: [README.md](./README.md)
