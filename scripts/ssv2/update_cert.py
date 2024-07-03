from ssv2_client_wrapper import SSV2ClientWrapper
import os
import sys
import json
import logging

from pathlib import Path

cert_env = os.environ['CERT_ENVIRONMENT']
region = open('/etc/region').read().rstrip('\n')

SSV2_ENDPOINT = f"https://secret-service-ce.{region}.oracleiaas.com/v1"
if cert_env == "PROD":
    SSV2_CERT_PATH = "/secret/lvv-ui-prod/lvv_tls_server_secret/latest"
else:
    SSV2_CERT_PATH = "/secret/lvv-ui-beta/lvv_tls_server_secret/latest"

CERT_DIR_PATH = Path("/etc/certs/pki")
CHAIN_FILE_PATH = CERT_DIR_PATH / "lvv_ui_tls_server_cert.pem"
KEY_FILE_PATH = CERT_DIR_PATH / "lvv_ui_tls_server_key.pem"

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

client = SSV2ClientWrapper(endpoint=SSV2_ENDPOINT)


def fetch_cert():
    """
    Fetch certificate, key and intermediate from SS and save them
    """

    try:
        secret_str = client.get_secret(SSV2_CERT_PATH)
        logger.info("Fetched secrets")
    except Exception as err:
        logger.error(f"Error getting {SSV2_CERT_PATH}: {err}")
        sys.exit(1)

    secret_value = json.loads(secret_str)

    # Get each item from the dict
    key, cert, interm = str(secret_value["key"]), str(secret_value["cert"]), str(secret_value["intermediates"][0])

    # Combine the cert and the intermediate
    chain_cert = f"{cert}{interm}"

    # Ensure that the directory exists
    CERT_DIR_PATH.mkdir(exist_ok=True)

    # Save the files
    try:
        with CHAIN_FILE_PATH.open("w") as fh:
            fh.write(chain_cert)
            logger.info("Wrote chain cert")

        with KEY_FILE_PATH.open("w") as fh:
            fh.write(key)
            logger.info("Wrote key file cert")

    except IOError as err:
        logger.error(f"Failed to write cert and key into filesystem: {err}")
        sys.exit(1)


if __name__ == "__main__":
    fetch_cert()