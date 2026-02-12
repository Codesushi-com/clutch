#!/usr/bin/env bash
# Deploy script for clutch.md static site
# Usage: ./deploy.sh [environment]
#   environment: 'prod' (default) or 'staging'

set -euo pipefail

ENVIRONMENT="${1:-prod}"
BUCKET_NAME=""
CLOUDFRONT_ID=""

if [ "$ENVIRONMENT" == "prod" ]; then
  BUCKET_NAME="clutch.md"
  CLOUDFRONT_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[0]=='clutch.md'].Id" --output text --profile personal)
else
  echo "Error: Unknown environment '$ENVIRONMENT'"
  echo "Usage: ./deploy.sh [prod]"
  exit 1
fi

echo "🚀 Deploying clutch.md to $ENVIRONMENT..."
echo "   Bucket: $BUCKET_NAME"
echo "   CloudFront: $CLOUDFRONT_ID"
echo ""

# Build the Next.js static site
echo "📦 Building static site..."
pnpm build

# Check if out/ directory exists
if [ ! -d "out" ]; then
  echo "Error: Build output directory 'out/' not found. Make sure next.config.ts exports static output."
  exit 1
fi

# Sync to S3
echo "☁️  Syncing to S3..."
aws s3 sync out/ "s3://$BUCKET_NAME/" \
  --delete \
  --profile personal

# Invalidate CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_ID" \
  --paths "/*" \
  --profile personal \
  --query "Invalidation.Id" \
  --output text

echo ""
echo "✅ Deploy complete!"
echo "🌐 Website URL: https://clutch.md"
