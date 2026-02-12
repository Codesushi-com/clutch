terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = "us-west-1"
  profile = "personal"

  default_tags {
    tags = {
      ManagedBy = "opentofu"
      Project   = "clutch-landing"
      Repo      = "openclutch"
    }
  }
}

# us-east-1 provider (required for ACM certs used by CloudFront)
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = "personal"

  default_tags {
    tags = {
      ManagedBy = "opentofu"
      Project   = "clutch-landing"
      Repo      = "openclutch"
    }
  }
}

# --- Data source for existing Route 53 zone ---

data "aws_route53_zone" "clutch" {
  zone_id = "Z095590214QVPGP8OS4YC"
}

# --- Static site module ---

module "site" {
  source = "git@github.com:dbachelder/infra.git//modules/static-site?ref=main"

  domain_name = "clutch.md"
  zone_id     = data.aws_route53_zone.clutch.zone_id

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  tags = {
    Project = "clutch-landing"
  }
}
