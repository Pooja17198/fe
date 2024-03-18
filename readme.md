
## Build
### Building your service locally
Install JDK17 on your machine.

Setup toolchains plugin for JDK17. Copy the following contents to ~/.m2/toolchains.xml file. 
Replace {JDK_17_HOME} with the path of JDK17 on your machine. To find JDK17 path on MacOS run the following command `/usr/libexec/java_home -v 17`
```
<?xml version="1.0" encoding="UTF8"?>
<toolchains>
    <!-- JDK toolchains -->
    <toolchain>
        <type>jdk</type>
        <provides>
            <version>17</version>
        </provides>
        <configuration>
            <jdkHome>{JDK_17_HOME}</jdkHome>
        </configuration>
    </toolchain>
</toolchains>
```

Build the whole solution by running the following command from the repository root: 
```mvn clean install```

### Building your service on Build Service
ocibuild.conf is included by default in your service that is used to integrate with the Build Service.
To learn more, please follow https://confluence.oci.oraclecorp.com/x/7kMZBg

By default, we use compartment ID provided by Build Service which only has Read permission and
not Update/Delete/Create permission. With read permission, you are only limited to accessing your builds in Build Service UI. The Update/Delete/Create permissions are required for essential operations like retrying builds, canceling ongoing builds, etc.
Hence, we highly recommend onboard to build service AuthZ using a compartment ID in your service's tenancy- https://confluence.oci.oraclecorp.com/x/h81fJw

To common questions related to build service issues in your generate service, please refer to   
https://confluence.oci.oraclecorp.com/x/u0O8Gg and https://confluence.oci.oraclecorp.com/x/OCHQCg


**Troubleshooting**

Make sure your development environment is set up properly. Including, making sure that the maven settings.xml file has the correct content. See the following links for details:

https://confluence.oci.oraclecorp.com/display/PGI/Dev+Environment+and+Tools+Setup

https://confluence.oci.oraclecorp.com/display/IODOCS/Artifactory+-+Maven+Repositories

##Secret Service Integration

Secret Service is an internal secret management product offered to internal Oracle services. If you need to consume any secrets in your service like private keys, passwords etc. 
You need integrate with the Secret Service. To learn more [SSV2 Onboarding Guide](https://confluence.oci.oraclecorp.com/x/lBokKQ)
and [SSV2 Troubleshooting FAQ](https://confluence.oci.oraclecorp.com/x/uBokKQ)

This project already comes with the plumbing to read Secrets from the Secret Service (during development from the local file system)
```
//first inject SecretRetriever to your class
@Inject
public LvvFrontend(... , SecretRetriever secretRetriever) {
   // then use retrieveSecret method to read secret at ang given path 
   byte[] secretBytes = secretRetriever.retrieveSecret("mySecret/latest");
   String secretValue = new String(secretBytes, Charset.defaultCharset());
}
```

#Deploy with Shepherd
```lvv-frontend-config```contains Shepherd configs to deploy the service. Check https://confluence.oci.oraclecorp.com/display/SHEP/Shepherd+Onboarding for shepherd onboarding.

# Creating an operations Dashboard
We provide a basic starting operational dashboard in dashboard.json. Use the following steps to setup the dashboard in Grafana.
1. Navigate to the OCI Grafana instance: https://grafana.oci.oraclecorp.com
1. Click on the `Home` icon in bar at the top.
1. Click on the `Import Dashboard` button.
1. Copy the contents of `dashboard.json` file and paste it into the input box titled `or Paste JSON`.
1. Click the `Load` button.

## Code Style
Please see style.md

## Dependency Management
This template relies on both [dropwizard-service-bom](https://confluence.oci.oraclecorp.com/x/8IF2Gg) and [oci-internal-bom](https://confluence.oci.oraclecorp.com/x/BeAPGQ) for dependency management. 

These boms include the most commonly used dropwizard-related and OCI internal dependency versions so that 
you can spend less time maintaining and updating individual dependency versions.

Every time you build this solution you will be notified of the latest updates to both boms in the 
file `bom-dependency-versions.txt`. The SFW team strongly recommends that you stay up to date with the latest versions 
of both boms so that your dependencies are up to date. This way you spend less time in the future 
addressing security vulnerabilities, etc.

## Contacting ServiceGeneration Team
This service was generated using [ServiceGeneration Tool](https://devops.oci.oraclecorp.com/t/4GHmGJ). 
Please follow [contact us](https://confluence.oci.oraclecorp.com/display/lvv-frontend/Contact+us) to reach out to us for questions, feature request or bug reporting etc.  

## Contacting lvv-frontend Team
[lvv-frontend team](https://devops.oci.oraclecorp.com/phonebook/network-automation) owns this service. Please reach out to them for any questions or concerns. 
