output "bucket_name" {
  description = "S3 bucket name for deploying site files"
  value       = module.site.bucket_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = module.site.cloudfront_distribution_id
}

output "website_url" {
  description = "Full website URL"
  value       = module.site.website_url
}
