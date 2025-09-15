FROM ocr-docker-remote.artifactory.oci.oraclecorp.com/os/oraclelinux:9-slim-fips
COPY --from=odo-docker-signed-local.artifactory.oci.oraclecorp.com/base-image-support/ol9:1.36 / /
ENTRYPOINT ["/sbin/simple_init.py"]
RUN microdnf install -y dnf && dnf install 'dnf-command(config-manager)'
ARG yum_ociregion=-phx
RUN echo ${yum_ociregion} > /etc/dnf/vars/ociregion
RUN dnf install oracle-epel-release-el9

ENV PIP_ARGS="--ignore-installed --trusted-host=artifactory.oci.oraclecorp.com -i https://artifactory.oci.oraclecorp.com/api/pypi/global-release-pypi/simple/"

# Installing system packages
RUN dnf install -y \
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
        python3 \
        readline-devel \
        strace \
        tcpdump \
        traceroute \
        vi \
        vim \
        wget \
        which \
        libcap \
        sudo \
    && dnf clean all

RUN dnf install -y lumberjack-chainsaw2-nodeps-noarch && \
    dnf install yum-plugin-versionlock && \
    dnf config-manager --add-repo https://artifactory.oci.oraclecorp.com/graalvm-release-yum-local/ && \
    dnf install --setopt=obsoletes=0 graalvm21-ee-17-jdk && \
    dnf versionlock 'graalvm*' && \
    dnf clean all

# Explicitly disable PHP to suppress conflicting requests error
RUN dnf -y module disable php && \
    dnf module enable nginx:1.22 && \
    dnf install -y nginx && \
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
    # https://github.com/urllib3/urllib3/issues/2168;
    python3 -m pip install ${PIP_ARGS} --timeout=100 "urllib3<2" && \
    python3 -m pip install ${PIP_ARGS} --timeout=100 -r /scripts/ssv2/requirements.txt && \
    python3 -m pip cache purge

RUN chmod +x /postDeployValidate.sh \
    /etc/service/nginx/log/run \
    /etc/service/nginx/run

# Create directories
RUN mkdir -p /etc/sv/nginx/log

# Executable Activation
RUN ln -s /etc/sv/nginx /etc/service/nginx

# Ensure run scripts are executable
# RUN find /etc/sv/ -name run -exec chmod +x {} \;

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