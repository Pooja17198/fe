# Odo base image: https://confluence.oci.oraclecorp.com/x/7KbfFQ
FROM ocr-docker-remote.artifactory.oci.oraclecorp.com/os/oraclelinux:7-slim
COPY --from=odo-docker-signed-local.artifactory.oci.oraclecorp.com/base-image-support/ol7:1.20 / /
ENTRYPOINT ["/sbin/simple_init.py"]

## TESTING ON YOUR DESKTOP
# From the root directory of the service (where the pom.xml is...)
# Build artifacts: 'mvn clean install'
# Build image: 'docker build -t lvv-frontend-canary -f docker/Dockerfile .'
# List images: 'docker images'
# Run the image: 'docker run --net=host --name lvv-frontend-canary lvv-frontend-canary:latest'
# List it: 'docker ps'
# Connect to it: 'docker exec -ti lvv-frontend-canary /bin/bash'


# =============================================================================
# Maintainer
# =============================================================================
MAINTAINER <opc_nw_automation_dev_us_grp@oracle.com>

# =============================================================================
# Odo base image utils
# =============================================================================
RUN yum install -y lumberjack-chainsaw2-nodeps-noarch && \
    yum install yum-plugin-versionlock && \
    yum-config-manager --add-repo https://artifactory.oci.oraclecorp.com/graalvm-release-yum-local/ && \
    yum install --setopt=obsoletes=0 graalvm21-ee-17-jdk && \
    yum versionlock 'graalvm*' && \
    yum clean all

# =============================================================================
# Executables
# =============================================================================
RUN mkdir -p etc/runit/artifacts

# -----------------------------------------------------------------------------
# Executable : lvv-frontend-canary
# -----------------------------------------------------------------------------
# Executable : lvv-frontend-canary : Artifact
RUN mkdir -p /etc/runit/artifacts/lvv-frontend-canary
COPY ./run.sh /etc/runit/artifacts/lvv-frontend-canary
COPY ./target/lvv-frontend-canary-*.jar /etc/runit/artifacts/lvv-frontend-canary/target/

COPY ./target/config /etc/runit/artifacts/lvv-frontend-canary/target/config
COPY ./target/environment-config /etc/runit/artifacts/lvv-frontend-canary/target/environment-config
COPY ./target/scripts /etc/runit/artifacts/lvv-frontend-canary/target/scripts

# Executable : lvv-frontend-canary : Service Directory Entry
RUN mkdir -p /etc/sv/lvv-frontend-canary
COPY ./target/docker/etc/runit/scripts/lvv-frontend-canary/lvv-frontend-canary.run /etc/sv/lvv-frontend-canary/run
RUN chmod +x /etc/sv/lvv-frontend-canary/run

# Executable : lvv-frontend-canary : Logging
RUN mkdir -p /etc/sv/lvv-frontend-canary/log
COPY ./target/docker/etc/runit/scripts/lvv-frontend-canary/lvv-frontend-canary.log /etc/sv/lvv-frontend-canary/log/run
RUN chmod +x /etc/sv/lvv-frontend-canary/log/run

# Executable : lvv-frontend-canary : Activation
RUN ln -s /etc/sv/lvv-frontend-canary /etc/service/lvv-frontend-canary

# When instantiating a JCE provider's implementation (class) of a Cipher, KeyAgreement, KeyGenerator, MAC or
# SecretKey factory, the JCA framework determines the provider's codebase (JAR file) and verifies its signature.
# In this way, the JCA authenticates the provider and ensures that only providers signed by a trusted entity
# can be plugged into the JCA. Consequently, these classes cannot be extracted from their original JARs,
# such as the jipher-jce and bc-fips JARs, and included in an application's Uber JAR.
# Instead the original signed JARs must be available to the classloader by placing them in the classpath
RUN mkdir -p /etc/runit/artifacts/lvv-frontend-canary/target/classpath
COPY ./target/classpath/jipher-jce.jar /etc/runit/artifacts/lvv-frontend-canary/target/classpath
COPY ./target/classpath/bc-fips.jar /etc/runit/artifacts/lvv-frontend-canary/target/classpath

COPY ./target/classpath/bcpkix-fips.jar /etc/runit/artifacts/lvv-frontend-canary/target/classpath

# Install the prism-agent JAR file
RUN mkdir -p /etc/runit/artifacts/lvv-frontend-canary/target/agentpath
COPY ./target/agentpath/prism-agent.jar /etc/runit/artifacts/lvv-frontend-canary/target/agentpath

# =============================================================================
# Init
# =============================================================================
# simple_startup.py handles all the runtime configuration stuff, like creating
# directories in mounted volumes (mounted volumes are not available until
# the container has been started, naturally). This is a generated file, so
# you can modify it as necessary to satisfy your startup needs.

# simple_startup.py is called from the base image
# See https://bitbucket.oci.oraclecorp.com/projects/ODO-INFRA/repos/pic-base-images-builder/browse/oel71-base/Dockerfile

# work-around for https://jira-sd.mc1.oracleiaas.com/browse/BLDOPS-5280
# remove once the issue is resolved
RUN true

COPY ./target/docker/sbin/simple_startup.py /sbin/simple_startup.py

# =============================================================================
# Setup the ODO validation script
# =============================================================================
# https://confluence.oci.oraclecorp.com/display/odo/Server+Validation+for+Containers

ADD ./target/scripts/postDeployValidate.sh /postDeployValidate.sh
RUN chmod +x /postDeployValidate.sh

# =============================================================================
# Chainsaw
# =============================================================================
# Configure runit to manage Chainsaw
#
# Executable : Chainsaw : Service Directory Entry
RUN mkdir -p /etc/sv/chainsaw
COPY ./target/docker/etc/sv/chainsaw/run /etc/sv/chainsaw/run
RUN chmod +x /etc/sv/chainsaw/run

# Executable : Chainsaw : Activation
RUN ln -s /etc/sv/chainsaw /etc/service/chainsaw

# Open ports
EXPOSE 24000

# =============================================================================
# Install useful operational tools
# =============================================================================
RUN yum -y install less \
    lsof \
    tcpdump \
    gnutls \
    openssl \
    vim-minimal \
    && yum clean all

# Fix ownership for files/paths that are written to at runtime
RUN chown -R odosvc /etc/{sv,service,runit} /var/{log,cache} /run
