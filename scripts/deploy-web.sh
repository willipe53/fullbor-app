#!/bin/zsh

aws s3 sync ../web-root s3://fullbor-web-root/ 
aws cloudfront create-invalidation --distribution-id="EPZLOBGCZS220" --paths "/*" 
