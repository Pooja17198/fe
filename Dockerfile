FROM ocr-docker-remote.artifactory.oci.oraclecorp.com/os/oraclelinux:8
COPY --from=odo-docker-signed-local.artifactory.oci.oraclecorp.com/base-image-support/ol8:1.34 / /
ENTRYPOINT ["/sbin/simple_init.py"]

ENV PIP_ARGS="--ignore-installed --trusted-host=artifactory.oci.oraclecorp.com -i https://artifactory.oci.oraclecorp.com/api/pypi/global-release-pypi/simple/"

# Installing system packages
RUN yum install -y \
        bind-utils \
        bzip2 \
        gcc \
        git \
        hostname \
        iproute \
        iputils \
        jemalloc \
        lbzip2 \
        lsof \
        make \
        net-tools \
        nmap-ncat \
        openssl \
        openssl-devel \
        patch \
        \
        python36 \
        \
        readline-devel \
        strace \
        tcpdump \
        traceroute \
        vi \
        vim \
        wget \
        which \
        \
        libcap \
        sudo \
    && yum clean all

RUN yum install -y lumberjack-chainsaw2-nodeps-noarch && \
    yum install yum-plugin-versionlock && \
    yum-config-manager --add-repo https://artifactory.oci.oraclecorp.com/graalvm-release-yum-local/ && \
    yum install --setopt=obsoletes=0 graalvm21-ee-17-jdk && \
    yum versionlock 'graalvm*' && \
    yum clean all

RUN echo ${yum_ociregion} > /etc/dnf/vars/ociregion && \
    dnf -y update && \
    # Explicitly disable PHP to suppress conflicting requests error
    dnf -y module disable php \
    && \
    dnf -y module enable nginx:1.20 && \
    dnf -y install nginx && \
    dnf clean all

RUN echo "Start creating nginx."

# copy Nginx config files
ADD docker/scripts /scripts
ADD docker/etc /etc
ADD docker/sbin /sbin
ADD docker/scripts/postDeployValidate.sh /postDeployValidate.sh
ADD scripts/ssv2/ scripts/ssv2

WORKDIR /scripts

# Installing Python Packages and activating venv
RUN python3 -m venv env && \
    source env/bin/activate && \
    python3 -m pip install -U pip && \
    python3 -m pip install ${PIP_ARGS} -r /scripts/ssv2/requirements.txt && \
    python3 -m pip cache purge

RUN chmod +x /postDeployValidate.sh \
    /etc/service/nginx/log/run \
    /etc/service/nginx/run

# Create directories
RUN mkdir -p /etc/sv/nginx/log

# Executable Activation
RUN ln -s /etc/sv/nginx /etc/service/nginx

# Ensure run scripts are executable
RUN find /etc/sv/ -name run -exec chmod +x {} \;

# Create directory where certs
RUN mkdir /etc/certs
RUN mkdir /etc/certs/pki

RUN chmod +x -R /etc/{sv,service,certs} /scripts
RUN chown -R odosvc:odosvc /etc/{sv,service} /scripts
RUN mkdir -p /var/lib/nginx /var/log/nginx && \
    chown -R odosvc:odosvc /var/lib/nginx /var/log/nginx /etc/certs/pki && \
    chmod 755 -R /var/lib/nginx /var/log/nginx

# =============================================================================
# Chainsaw
# =============================================================================
# Configure runit to manage Chainsaw
#
# Executable : Chainsaw : Service Directory Entry
RUN chmod +x /etc/sv/chainsaw/run

# Executable : Chainsaw : Activation
RUN ln -s /etc/sv/chainsaw /etc/service/chainsaw

RUN mkdir -p /logs /run && \
    chown -R odosvc:odosvc /logs/ /etc/nginx/conf.d /etc/{sv,service} /var/{log,cache} /run/

# Add nginx logging output
RUN mkdir -p /logs/nginx/ && \
    chmod 755 -R /logs/nginx

COPY web/. /usr/share/nginx/html/

# Enable nginx service to bind to privileged ports
#RUN echo "odosvc ALL=(ALL) NOPASSWD: / user/sbin/nginx" >> /etc/sudoers
#RUN setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx

# Open ports
EXPOSE 8443