# lambdas

Folder contains python scripts that are deployed as lambdas with `scripts/deploy-lambdas.py`

Call `deploy-lambda.py -h` for instructions, but essentially:

- `--validate-only` will simply report on whether the lambda is in complance with `api-config\openapi.yaml`
- `--deploy-only` will upload the python code to AWS and confirm the API Gateway configuration is correct

By default it does both. Script can be run for a single file or for all lambas in the directory (the default).
