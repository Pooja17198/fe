# Quick Start
## Building
From the package root:
  ```mvn clean install```

## Running
Running:`./run.sh`<br />
With a different config:`./run.sh config/dev.conf`<br />
With debugging: `./run.sh --debug`<br />
With a debug port: `./run.sh --debug=9090`<br />
With lots of options: `./run.sh config/dev.conf --debug=9090`<br />
Running locally: `./run.sh config/desktop.conf`<br />

## Canary User
Canary designed to make API call as user "canary". 
So please first create a canary user under your Tenancy through OCI console, and manually create a pair of 
privateKey and public key. Upload the public key to your Canary user through console and save the private key in Vault. 
Update your "canary" user information (including userId, fingerPrint, privateKey) in base.conf.
Update your Vault stored privateKey path in prod.conf.

# Features
* Configured to build with Maven
* Guice enabled
* Lombok enabled
