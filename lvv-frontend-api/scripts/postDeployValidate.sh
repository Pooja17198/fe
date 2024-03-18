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

validate_healthcheck() {
    RESULT=$1
    validate_status_code "$RESULT"
    VALIDATE_STATUS_RETURN_CODE=$?
    if [[ "$VALIDATE_STATUS_RETURN_CODE" -eq "0" ]]; then
        REGEX="false"
        if [[ "$RESULT" =~ $REGEX ]]; then
            echo "Health check failed (one or more 'healthy' states is false)"
            return 1
        else
            echo "Health check passed"
            return 0
        fi
    else
        REGEX=" 000$"
        if [[ "$RESULT" =~ $REGEX ]]; then
            echo "Health check failed (service appears not to be running)"
        else
            echo "Health check failed (didn't return HTTP 200)"
        fi
        return 1
    fi
}

validate_status_code() {
    RESULT=$1
    REGEX=" 200$"
    if [[ "$RESULT" =~ $REGEX ]]; then
      return 0
    else
      return 1
    fi
}

CURRENT_TIME=$(date +%s)
END_TIME=$(($CURRENT_TIME + 30))
SUCCESS=1
until [ $CURRENT_TIME -ge $END_TIME ] || [ "$SUCCESS" -eq "0" ]
do
    CURRENT_TIME=$(date +%s)
    RESULT=$(curl --write-out " %{http_code}" "http://localhost:21001/healthcheck" 2> /dev/null)
    echo "Health check result: $RESULT"

    validate_healthcheck "$RESULT"
    VALIDATE_RESULTS=$?
    if [[ "$VALIDATE_RESULTS" -eq "0" ]]; then
        SUCCESS=0
    else
        # sleep 5 seconds
        sleep 5
    fi
done

if [[ "$SUCCESS" -eq "0" ]]; then
    RESULT=$(curl -X POST --write-out " %{http_code}" "http://localhost:21001/tasks/deepcheck" 2> /dev/null)
    echo "Deep check result: $RESULT"
    validate_status_code "$RESULT"
    VALIDATE_STATUS_RETURN_CODE=$?
    if [[ "$VALIDATE_STATUS_RETURN_CODE" -eq "0" ]]; then
      echo "Deep check passed"
    else
      echo "Deep check failed"
      SUCCESS=1
    fi
fi

if [[ "$SUCCESS" -ne "0" ]]; then
    # Capture the last bit of logs from runit/lvv-frontend-api/current
    tail -n 100 /logs/runit/lvv-frontend-api/current
fi

exit $SUCCESS
