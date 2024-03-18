#!/bin/bash
set -eu  # Exit on error
set -o pipefail  # Fail a pipe if any sub-command fails.

# This script was generated from the Tanden Engine
# https://confluence.oci.oraclecorp.com/display/Tanden/Tanden+Engine

# This is the main launch script for launching the service on your desktop and
# in an ODO deployed docker container.

VERSION=1.10

# This allows running this script without having to be in this script directory,
# e.g., you can run the script using /some/workspace/path/service/run.sh or
# ./path/service/run.sh
cd "$(dirname "$0")"

# Configuration settings
JAR="target/lvv-frontend-canary-*\.jar"
DEFAULT_DEBUG_PORT=5005
DESKTOP_LOCATION="desktop"
DEBUG_COMMAND="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address="

# These three files are place into the docker container by ODO.  If the region and ad files are not present, we will
# assume the docker container was not ODO deployed. ODO deployed applications will look for the
# conf file <region>-<availabilityDomain>.conf, and if it isn't found it will look for the
# conf file <region>.conf, and if it isn't found it will look for the
# conf file <realm>.conf
# It is
REALM_FILE="/etc/identity-realm"
REGION_FILE="/etc/region"
AD_FILE="/etc/availability-domain"

DEBUG=""
CFG=""
JAR_FILE=$(ls $JAR | grep -v "sources\.jar$" | grep -v "javadoc\.jar$" 2> /dev/null)
RED='\033[0;31m'
ORANGE='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

function usage() {
  echo "run.sh version: $VERSION"
  echo "Launches the server."
  echo "Usage: ./run.sh <config file> --debug=PORT"
  echo
  echo "Options:"
  echo "--debug|d             Launch the JVM in remote debugging mode listening"
  echo "--debug=<port>        to the specified port or else the default port of"
  echo "                      5005."
  echo "--help                Prints the help screen"
  echo
  echo "Examples:"
  echo "./run.sh"
  echo "./run.sh --debug"
  echo "./run.sh --debug=5005"
  echo "./run.sh config/test.conf"
  echo "./run.sh config/test.conf --debug"
  echo "./run.sh config/test.conf --debug=5005"
  echo "./run.sh --debug=5005 config/test.conf"
  exit 0
}

function die() {
  printf "${RED}%s\n${NC}" "$1" >&2
  exit 1
}

function warn() {
  printf "${ORANGE}%s\n${NC}" "$1"
}

function info() {
  printf "${GREEN}%s\n${NC}" "$1"
}

for i in "$@"
do
case $i in
  -d|--debug)
    DEBUG="$DEBUG_COMMAND$DEFAULT_DEBUG_PORT"
    shift
    ;;
  -d=*|--debug=*)
    DEBUG="$DEBUG_COMMAND${i#*=}"
    shift
    ;;
  -h|--help)
    usage
    shift
    ;;
  *)
    # If the arg doesn't start with a '-', assume to be the config file
    [[ "$i" != -* ]] && CFG="$i" ; shift
    # Otherwise it's an unknown option
    ;;
esac
done

info "run.sh executed from $(pwd)"

# Verify only a single jar was found
if [[ `echo -n "$JAR_FILE" | grep -c '^'` > 1 ]] ; then
  die "Only a single jar is expected, but found more than one: $JAR_FILE"
fi

# Verify the jar exists
if [[ ! -f "$JAR_FILE" ]] ; then
  die "jar file '$JAR' not found.  Did you build? If not, run: mvn clean install"
fi

# If supplied, make sure the config file exists
if [[ "$CFG" && ! -f "$CFG" ]] ; then
   die "Config file '$CFG' does not exist or is not a file"
fi

ODO_DEPLOYED=false
if [[ -e "$REGION_FILE" && -e "$AD_FILE" ]]; then
  ODO_DEPLOYED=true
fi

# Figure out which realm, region, and AD we are in.
REALM=""
REGION=""
STAGE="dev"
if [[ $ODO_DEPLOYED == true ]]; then
  REALM=$(echo $(cat "$REALM_FILE") | tr '[:upper:]' '[:lower:]')
  REGION=$(echo $(cat "$REGION_FILE") | tr '[:upper:]' '[:lower:]')
  AVAILABILITY_DOMAIN=$(echo $(cat "$AD_FILE") | tr '[:upper:]' '[:lower:]')

  info "Found realm:  $REALM "
  info "Found region:  $REGION "
  info "Found availability domain: $AVAILABILITY_DOMAIN "

  STAGE="prod"
  LOCATION=$(echo "$REGION-$AVAILABILITY_DOMAIN")
else
  # Not in a Docker container. Assumed to be running on a developers desktop.
  LOCATION="$DESKTOP_LOCATION"
  warn "Not ODO deployed. Assuming to be a developer desktop.  Defaulting to location $LOCATION"
fi


if [[ -n $CFG ]] ; then
    # If CFG provided, don't try other configs
    if [[ ! -f "$CFG" ]] ; then
       die "Config file '$CFG' does not exist or is not a file"
    fi
elif [[ ! -z "${ENV_OVERRIDE-}" ]] ; then
    # By setting the ENV_OVERRIDE environment variable, you can load a different conf file.
    # This is useful where you want to run a test stack in the same region as an existing stack
    CFG="target/config/$ENV_OVERRIDE.conf"
    info "The ENV_OVERRIDE environment variable is set. Will use $ENV_OVERRIDE to build the conf file"
    if [[ ! -f "$CFG" ]] ; then
       die "The ENV_OVERRIDE file '$CFG' does not exist or is not a file"
    fi
else
    # Look for matching config files in this order:
    if [[ ! -z "${USER-}" ]] ; then
        USER_CFG="target/config/$USER.conf"         # Ex: rroller.conf
    else
        USER_CFG=""
    fi
    LOCATION_CFG="target/config/$LOCATION.conf" # Ex: desktop.conf, r2-ad1.conf, us-ashburn-1-ad2.conf
    REGION_CFG="target/config/$REGION.conf"     # Ex: r1.conf, r2.conf, us-ashburn-1.conf
    REALM_CFG="target/config/$REALM.conf"       # Ex: region1.conf, oc1.conf, oc2.conf
    STAGE_CFG="target/config/$STAGE.conf"       # Ex: dev.conf, prod.conf

    info "Looking for configs in: (user: $USER_CFG), (location: $LOCATION_CFG), (region: $REGION_CFG), (realm: $REALM_CFG), (stage: $STAGE_CFG)"
    if [[ $LOCATION == "$DESKTOP_LOCATION" && -f "$USER_CFG" ]] ; then
        CFG="$USER_CONFIG"
    elif [[ -f "$LOCATION_CFG" ]] ; then
        CFG="$LOCATION_CFG"
    elif [[ -f "$REGION_CFG" ]] ; then
        CFG="$REGION_CFG"
    elif [[ -f "$REALM_CFG" ]] ; then
        CFG="$REALM_CFG"
    elif [[ -f "$STAGE_CFG" ]] ; then
        CFG="$STAGE_CFG"
    else
        die "Unable to find a suitable configuration file."
    fi
fi

info "Using config file $(pwd)/$CFG"

#figure out which environment file to run. the logic mirrors the config file generation above
# Look for matching config files in this order:
cd target/environment-config/
LOCATION_ENV="$LOCATION.env"
REGION_ENV="$REGION.env"
STAGE_ENV="$STAGE.env"
BASE_ENV="base.env"
info "Looking for environment configs in: (location: target/config/$LOCATION_ENV), (region:target/config/$REGION_ENV), (stage: target/config/$STAGE_ENV) (base: target/config/$BASE_ENV)"
if [[ -f "$LOCATION_ENV" ]] ; then
    ENV_FILE="$LOCATION_ENV"
elif [[ -f "$REGION_ENV" ]] ; then
    ENV_FILE="$REGION_ENV"
elif [[ -f "$STAGE_ENV" ]] ; then
    ENV_FILE="$STAGE_ENV"
elif [[ -f "$BASE_ENV" ]] ; then
    ENV_FILE="$BASE_ENV"
else
    die "Unable to find a suitable environment file."
fi
info "Using environment config file $(pwd)/$ENV_FILE"
source $ENV_FILE
cd ../..

# The jipher-jce JAR contains native shared library files that it must extract to the filesystem and then load into
# the Java process. The system property 'jipher.user.dir' can be used to specify the directory path location in which
# Jipher creates temporary directories into which it extracts the native shared library files.  If unset,
# 'jipher.user.dir' defaults to the value of the system property 'java.io.tmpdir'. This is typically '/tmp'.
# '/tmp' is typically mounted with the 'noexec' flag set on OCI instances.
# If Jipher attempts to create a directory in a read-only file system it will trigger:
#     'java.nio.file.FileSystemException: Read-only file system'.
#     'java.nio.file.AccessDeniedException: <path>'.
# If Jipher attempts to load shared libraries into the Java process from a file system mounted with the
# 'noexec' flag set it will trigger:
#     'failed to map segment from shared object: Operation not permitted'.
if [[ $ODO_DEPLOYED == true ]]; then
    # The ODO deployment of the lvv-frontend mounts '/' read-only and '/data' read-write.
    export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS-} -Djipher.user.dir=/data"
else
    # Assumed to be running on a developer's desktop
    export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS-} -Djipher.user.dir=$(pwd)"
fi

# At present service teams will have JipherJCE enabled as a default Java cryptography provider.
# See https://confluence.oci.oraclecorp.com/display/OCICRYPTO/Jipher+Adoption+Engineering+Plan for details.
# If there is a particular use-case where a service team has to opt-out of using JipherJCE and instead use BCFIPS as
# their Java cryptography provider, then those service teams can achieve this by commenting the following line to use
# Bouncy Castle in preference to Jipher.
# See https://confluence.oraclecorp.com/confluence/x/bpUd-/ to learn more about Jipher.
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS-} -DuseJipherJceProvider=true"

# If the system property useJipherJceProvider is set to true in a non FIPS realm then the JipherJCE provider is
# registered as the lowest priority java security provider to ensure that FIPS restrictions are not enforced in
# non FIPS realms. Service teams can opt-in to having the JipherJCE provider registered as the highest priority
# java security provider in non FIPS realms (in addition to FIPS realms) by commenting in the following line
# which sets the system property prioritizeJipherJceProviderInNonFipsRealms to true.
# See https://confluence.oraclecorp.com/confluence/display/OCICRYPTO/Using+Jipher+JCE+where+cryptography+not+approved+by+the+FIPS+standard+is+required
# to learn about using JipherJCE where cryptography not approved by the FIPS standard is required.
# export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS-} -DprioritizeJipherJceProviderInNonFipsRealms=true"

# When a JCE provider underpins the SunJSSE it must access the internal JDK API:
#   sun.security.internal.spec.TlsMasterSecretParameterSpec
# This is not permitted (by default) for internal JDK classes since JDK 16. The following line grants access to classes
# in the sun.security.internal.spec package in the java.base module to all classes in the jipher.jce module.
# The 'ALL-UNNAMED' specifier is currently necessary because:
#   1. jipher-jce has not yet been released as a java module. Delivering jipher-jce as a java module is
#      * tracked in https://jira.oci.oraclecorp.com/browse/JIPHER-55.
#      * under development in https://bitbucket.oci.oraclecorp.com/projects/JIPHER/repos/jipher-jce/browse?at=refs%2Fheads%2Fdpmakepe%2Fadd-module-info
#   2. the lvv-frontend currently adds jipher-jce to class-path not the module-path
# See https://docs.oracle.com/en/java/javase/16/migrate/migrating-jdk-8-later-jdk-releases.html#GUID-2F61F3A9-0979-46A4-8B49-325BA0EE8B66
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS-} --add-exports=java.base/sun.security.internal.spec=ALL-UNNAMED,jipher.jce"

# At present service teams have to opt-in to using the performance metrics agent (prism-agent)
# to instrument the application's byte code to emit metrics for JCE method call times.
# export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS-} -javaagent:./target/agentpath/prism-agent.jar"

# Agent options can be specified by putting them after an '=' character following the JAR path.
# The following option sets the capacity of the prism-agent's method-called event queue.
# The default queue-capacity is 10,000 entries.
# See https://bitbucket.oci.oraclecorp.com/projects/CRYPTOGRAPHY/repos/prism-agent/browse/README.md for details.
# export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS-}=queue-capacity=<entry count>"

# Enabling Java Security Provider logging
# https://docs.oracle.com/javase/8/docs/technotes/guides/security/troubleshooting-security.html
# can facilitate identifying which provider provides each cryptographic feature.
# Uncomment the following line to enable Java Security Provider logging
# export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS-} -Djava.security.debug=provider"

CMD="java $DEBUG -Djava.security.egd=file:///dev/urandom --add-exports=java.base/sun.security.util=ALL-UNNAMED \
                                                         --add-exports=java.base/sun.security.x509=ALL-UNNAMED \
                                                         --add-opens=java.base/jdk.internal.misc=ALL-UNNAMED \
                                                         --add-opens=java.base/java.lang.invoke=ALL-UNNAMED \
                                                         --add-opens=java.base/java.util=ALL-UNNAMED \
                                                         --add-opens=java.base/sun.nio.ch=ALL-UNNAMED \
                                                         --add-opens=java.base/java.nio=ALL-UNNAMED \
                                                         $JAVA_MEMORY_SETTINGS $JVM_GC_OPTIONS $TRUST_STORE_SETTINGS -jar $JAR_FILE server $CFG"

# Disable core dumps by default. On production (stable) machines, we should not be collecting dumps by default.
# You run the risk of running out of docker space if core dumps are enabled.
# Remove / comment this line if you intentionally want to enable dumps (say for an unstable environment).
ulimit -c 0

# Now execute it
info "Executing: $CMD"
exec $CMD
