# The four app images the e2e stack runs, built from docker/Dockerfile in one invocation so
# BuildKit runs the shared builder stage once and the per-app builds in parallel. ci.yml's
# build-app-images job; operations builds on its own because e2e does not need it. By hand:
#
#   docker buildx bake -f docker/docker-bake.hcl --load

# OCI labels. On a push to main publish-images.yml pushes the images ci.yml built, so ci.yml sets
# these from its run; the infrastructure repo reads the revision label. Unset, a label is left out.
variable "OCI_SOURCE" { default = "" }
variable "OCI_REVISION" { default = "" }
variable "OCI_CREATED" { default = "" }

target "app" {
  name = item.app
  matrix = {
    item = [
      { app = "public-web", target = "web" },
      { app = "internal-web", target = "web" },
      { app = "public-api", target = "api" },
      { app = "internal-api", target = "api" },
    ]
  }
  context    = "."
  dockerfile = "docker/Dockerfile"
  target     = item.target
  args       = { APP = item.app }
  tags       = ["fphd-ci/${item.app}:ci"]
  labels = {
    for key, value in {
      "org.opencontainers.image.title"    = "fphd-${item.app}"
      "org.opencontainers.image.source"   = OCI_SOURCE
      "org.opencontainers.image.revision" = OCI_REVISION
      "org.opencontainers.image.created"  = OCI_CREATED
      "org.opencontainers.image.licenses" = "MIT"
    } : key => value if value != ""
  }
}

group "default" {
  targets = ["public-web", "internal-web", "public-api", "internal-api"]
}
