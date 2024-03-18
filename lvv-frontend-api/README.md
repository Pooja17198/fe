# Quick Start
## Building
From the package root:
  ```mvn clean install```

### Troubleshooting
Make sure your development environment is set up properly. Including, making sure that the maven settings.xml file has the correct content. See the following links for details:
https://confluence.oci.oraclecorp.com/display/PGI/Dev+Environment+and+Tools+Setup
https://confluence.oci.oraclecorp.com/display/IODOCS/Artifactory+-+Maven+Repositories


## Running
Running:`./run.sh`
With a different config:`./run.sh config/dev.conf`
With debugging: `./run.sh --debug`
With a debug port: `./run.sh --debug=9090`
With lots of options: `./run.sh config/dev.conf --debug=9090`

# Endpoints
## Standard port (21000):
*` /ui` - The API explorer
* `/spec/api.json` - The API spec in JSON format

## Admin port (21001):
* `/` - A list of operational tools
* `/threads` - A list of threads
* `/metrics?pretty=true` - Metrics
* `/ping` - A ping command
* `/healthcheck?pretty=true` - Runs and prints out the health checks

# Features
* Configured to build with Maven
* Guice enabled
* Lombok enabled
* UI API explorer at /ui
* API spec exposed in JSON format at /spec/api.json
* Generated abstract resource classes based on the API spec

# Operational Readiness Checklist

Before moving your application to testing and ultimately production, address these checklist items

- [ ] Update default healthcheck (TODO: Documentation link)


# How to test Identity Integration locally with instance principals
For desktop development, we recommend turning auth off, however if you are making changes that effects how auth works, you may want to test changes locally. This document explains how.

This only applies to *Overlay/Customer enclave* users

## Steps for local setup

1. Setup a tunnel to your overlay host from your local machine (we recommend using a beta/integ env host)

    Why? 
    
    This is what will allow you to access instance principal certs locally and test auth functionality.
    You could also cat out the certs and use the files but this is much easier and will work over time
    as the certs rotate every 2 hours.
    
    How?
    
    The instance principal is unavailable locally but available on every instance in the cloud and can be obtained from the metadata service of the host. (Ref:  https://docs.cloud.oracle.com/en-us/iaas/Content/Compute/Tasks/gettingmetadata.htm)
    With the below ssh tunnel, the requests to localhost:8000 are forwarded to the metadata service (169.254.169.254:80):
    
    `ssh -L 8000:169.254.169.254:80 your_user@<ip_of_your_integ_env_host>`
    
    More about ssh tunneling:  https://www.ssh.com/ssh/tunneling/example

2. Run the code using desktop.conf

    Why?
    
    Only desktop specifies an override of the metadata endpoint, all other configs are null.
    
    How?
    
    Update desktop.conf 
    ```
    authConfig {
      authorizationEnabled: true
      tenantId: {your_tenant_id}
      authServiceEndpoint: "https://auth.us-{the_region_your_host_lives}-1.oraclecloud.com"
      instancePrincipalUrl: "http://localhost:8000/"
      defaultTrustStorePath: "/etc/oci-pki/ca-bundle.pem"
    }
    ```
