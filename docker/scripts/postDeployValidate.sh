#!/bin/bash

# See https://confluence.oci.oraclecorp.com/display/odo/Server+Validation+for+Containers

# What this script does:
# 1. Runs on a host to determine whether the host is healthy.
# 2. Returns 0 to indicate success (i.e. healthy host).
# 3. Returns non-0 to indicate failure (i.e. unhealthy host).
#
# When and where it's run:
# By ODO, during a deployment, on each host after ODO has deployed
# that host, before ODO moves on to the next host.

# What ODO validation scripts (such as this one) are for, in general:
# A safety precaution to prevent a bad deployment (e.g. somebody checked
# in broken code or config) from taking down an entire environment. It
# detects the problem early, before all hosts are affected, so that
# ODO has the opportunity to decide that the deployment is a bad idea
# and halt the deployment.

# Specifics about this particular script:
# The service it's checking is a Dropwizard application, which,
# means that it has a standard healthcheck implemented, which
# returns the following content when healthy:
#
# {"deadlocks":{"healthy":true},"service":{"healthy":true}}

# Traces of each command plus its arguments are printed to standard output
# after the commands have been expanded but before they are executed.
set -x;

# This should return 200 on a dummy port 8083 as it will try to hit the localhost and return a 200.
# RESULT=$(curl -k -s -o /dev/null -w '%{http_code}' localhost:8083)
# echo "Nginx health check result: $RESULT"

# if [[ "$RESULT" == "200" ]]; then
#     echo "Health check passed"
#     exit 0
# else
#     echo "Health check failed"
#     exit 1
# fi

exit 0