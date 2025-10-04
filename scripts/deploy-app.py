#!/usr/bin/env python3
"""
Deploy React App to S3 Script

This script:
1. Builds the production version of the React app using Vite
2. Syncs the build output to S3 bucket fullbor-app
3. Creates CloudFront invalidation for distribution E21BXW4BF9HUEI

Usage: python deploy-app.py [--region REGION]
"""

import argparse
import logging
import os
import subprocess
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
DEFAULT_REGION = "us-east-2"
S3_BUCKET_NAME = "fullbor-app"
CLOUDFRONT_DISTRIBUTION_ID = "E21BXW4BF9HUEI"


class AppDeployer:
    """Handles React app deployment to S3 and CloudFront invalidation."""

    def __init__(self, region: str = DEFAULT_REGION):
        """Initialize the deployer."""
        self.region = region
        self.s3_bucket = S3_BUCKET_NAME
        self.cloudfront_distribution_id = CLOUDFRONT_DISTRIBUTION_ID

        # Get the project root directory (parent of scripts directory)
        self.script_dir = Path(__file__).parent
        self.project_root = self.script_dir.parent

        # Initialize AWS client
        self.s3_client = boto3.client('s3', region_name=region)
        self.cloudfront_client = boto3.client('cloudfront', region_name=region)

    def run_command(self, command: list, description: str) -> bool:
        """Run a shell command and return success status."""
        logger.info(f"🔄 {description}...")
        logger.info(f"Running: {' '.join(command)}")

        try:
            result = subprocess.run(
                command,
                cwd=self.project_root,
                check=True,
                capture_output=True,
                text=True
            )

            if result.stdout:
                logger.info(f"Output: {result.stdout}")

            logger.info(f"✅: {description}")
            return True

        except subprocess.CalledProcessError as e:
            logger.error(f"❌ {description} failed:")
            logger.error(f"Command: {' '.join(command)}")
            logger.error(f"Exit code: {e.returncode}")
            logger.error(f"stdout: {e.stdout}")
            logger.error(f"stderr: {e.stderr}")
            return False

    def check_prerequisites(self) -> bool:
        """Check if required tools and files are available."""
        logger.info("🔍 Checking prerequisites...")

        # Check if we're in a git repository
        if not (self.project_root / ".git").exists():
            logger.error("❌ Not in a git repository")
            return False

        # Check if package.json exists
        if not (self.project_root / "package.json").exists():
            logger.error("❌ package.json not found")
            return False

        # Check if node_modules exists (dependencies installed)
        if not (self.project_root / "node_modules").exists():
            logger.error("❌ node_modules not found - run 'npm install' first")
            return False

        # Check if AWS CLI is available
        try:
            subprocess.run(["aws", "--version"],
                           check=True, capture_output=True)
            logger.info("✅ AWS CLI is available")
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.error("❌ AWS CLI not found or not working")
            return False

        logger.info("✅ All prerequisites met")
        return True

    def build_app(self) -> bool:
        """Build the React app for production."""
        logger.info("🏗️ Building React app for production...")

        # Run npm run build
        return self.run_command(
            ["npm", "run", "build"],
            "Building React app"
        )

    def check_s3_bucket(self) -> bool:
        """Check if S3 bucket exists and is accessible."""
        logger.info(f"🪣 Checking S3 bucket: {self.s3_bucket}")

        try:
            # Try to get bucket location
            response = self.s3_client.get_bucket_location(
                Bucket=self.s3_bucket)
            bucket_region = response.get('LocationConstraint') or 'us-east-1'
            logger.info(
                f"✅ S3 bucket {self.s3_bucket} exists in region {bucket_region}")
            return True

        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NoSuchBucket':
                logger.error(f"❌ S3 bucket {self.s3_bucket} does not exist")
                logger.error(
                    f"Please create it with: aws s3 mb s3://{self.s3_bucket} --region {self.region}")
            else:
                logger.error(f"❌ Error accessing S3 bucket: {e}")
            return False

    def deploy_to_s3(self) -> bool:
        """Deploy the built app to S3."""
        logger.info(f"📤 Deploying to S3 bucket: {self.s3_bucket}")

        dist_dir = self.project_root / "dist"
        if not dist_dir.exists():
            logger.error("❌ dist directory not found - run build first")
            return False

        try:
            # Use AWS CLI sync for efficient upload
            command = [
                "aws", "s3", "sync",
                str(dist_dir) + "/",
                f"s3://{self.s3_bucket}/",
                "--delete",  # Remove files that don't exist in local
                "--region", self.region
            ]

            logger.info(f"Running: {' '.join(command)}")
            result = subprocess.run(
                command, check=True, capture_output=True, text=True)

            if result.stdout:
                logger.info(f"Upload output: {result.stdout}")

            logger.info(f"✅ Successfully deployed to s3://{self.s3_bucket}")
            return True

        except subprocess.CalledProcessError as e:
            logger.error(f"❌ S3 sync failed:")
            logger.error(f"Exit код: {e.returncode}")
            logger.error(f"stderr: {e.stderr}")
            return False

    def invalidate_cloudfront(self) -> bool:
        """Create CloudFront invalidation."""
        logger.info(
            f"🚀 Creating CloudFront invalidation for distribution: {self.cloudfront_distribution_id}")

        try:
            invalidation_response = self.cloudfront_client.create_invalidation(
                DistributionId=self.cloudfront_distribution_id,
                InvalidationBatch={
                    'Paths': {
                        'Quantity': 1,
                        'Items': ['/*']
                    },
                    'CallerReference': f'web-app-{int(time.time())}-{self.cloudfront_distribution_id}'
                }
            )

            invalidation_id = invalidation_response['Invalidation']['Id']
            logger.info(
                f"✅ CloudFront invalidation created: {invalidation_id}")
            logger.info(
                f"Invalidation status: {invalidation_response['Invalidation']['Status']}")

            return True

        except ClientError as e:
            logger.error(f"❌ CloudFront invalidation failed: {e}")
            return False

    def deployment_stats(self) -> None:
        """Display deployment statistics."""
        logger.info("📊 Deployment completed!")
        logger.info(f"S3 Bucket: s3://{self.s3_bucket}")
        logger.info(
            f"CloudFront Distribution: {self.cloudfront_distribution_id}")
        logger.info(f"Region: {self.region}")
        logger.info("🌐 Your app should be available at: https://fullbor.ai")

    def deploy(self) -> None:
        """Main deployment method."""
        logger.info("🚀 Starting React app deployment...")

        try:
            # Check prerequisites
            if not self.check_prerequisites():
                raise Exception("Prerequisites check failed")

            # Build the app
            if not self.build_app():
                raise Exception("Build failed")

            # Check S3 bucket
            if not self.check_s3_bucket():
                raise Exception("S3 bucket check failed")

            # Deploy to S3
            if not self.deploy_to_s3():
                raise Exception("S3 deployment failed")

            # Invalidate CloudFront
            if not self.invalidate_cloudfront():
                raise Exception("CloudFront invalidation failed")

            # Show stats
            self.deployment_stats()

            logger.info("🎉 Deployment completed successfully!")

        except Exception as e:
            logger.error(f"❌ Deployment failed: {e}")
            raise


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Deploy React app to S3 and invalidate CloudFront'
    )
    parser.add_argument(
        '--region',
        default=DEFAULT_REGION,
        help=f'AWS region (default: {DEFAULT_REGION})'
    )
    parser.add_argument(
        '--bucket',
        default=S3_BUCKET_NAME,
        help=f'S3 bucket name (default: {S3_BUCKET_NAME})'
    )
    parser.add_argument(
        '--distribution',
        default=CLOUDFRONT_DISTRIBUTION_ID,
        help=f'CloudFront distribution ID (default: {CLOUDFRONT_DISTRIBUTION_ID})'
    )

    args = parser.parse_args()

    try:
        deployer = AppDeployer(region=args.region)
        deployer.deploy()
        return 0

    except Exception as e:
        logger.error(f"Deployment failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
