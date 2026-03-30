#!/bin/sh

# DOCS: for the OCI internal tool savant-client-generator
#   https://bitbucket.oci.oraclecorp.com/projects/DS/repos/oui/browse

# NOTE: For regional services, provide the `-t ./regional-client-template` arguments to generate clients
#       that accept a region parameter on each call.
OUTPUT_DIR="./gen/clients"
REPOSITORY="https://artifactory.oci.oraclecorp.com:443"

## Devops-ui-service
./node_modules/.bin/savant-client-generator local -d $OUTPUT_DIR -n ide-lvv-client -s ./src/landing/components/cabling/api/lib/lvv-api.cond.yaml
## RAD
# ./node_modules/.bin/savant-client-generator maven -h $REPOSITORY -d $OUTPUT_DIR -r dope-dope-release-maven-local -g com.oracle.pic.devops.rad -a region-automated-discovery-spec -i 0.2.42 -p internal/api.yaml -n rad-api-client
#

# Workaround for bug in swagger-codegent that does not generate map typing correctly
# https://github.com/swagger-api/swagger-codegen/issues/4839
# Determine correct invocation of sed (macos or linux)
sed --version >/dev/null 2>&1
if [ $? -gt 0 ]; then
  find $OUTPUT_DIR -iname '*.ts' -exec sed -i "" 's/extends null<\(.*\),\(.*\)>.*/{ [key: string]: \2;/' {} \;

  # Workaround for ISO dates (which are strings) using the `Date` type even though no conversion happens
  # This is safe because `Date`s can't be sent over the wire, so they're always strings
  find $OUTPUT_DIR -iname '*.ts' -exec sed -i "" 's/: Date;/: string;/' {} \;
else
  find $OUTPUT_DIR -iname '*.ts' -exec sed -i -- 's/extends null<\(.*\),\(.*\)>.*/{ [key: string]: \2;/' {} \;

  # Date => string conversion, see above comment
  find $OUTPUT_DIR -iname '*.ts' -exec sed -i -- 's/: Date;/: string;/' {} \;
fi
