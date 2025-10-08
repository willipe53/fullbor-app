#!/bin/bash
awslogs get /aws/lambda/PositionKeeper ALL --watch | sed -E 's|^[^ ]+ [^ ]+ ||'
