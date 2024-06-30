import vaultpythonsdk
import base64
import sys
import oci
import logging

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)
logger.addHandler(logging.StreamHandler(sys.stdout))

# This is always present in instances maintained by Chef.
# It needs to be mapped to the application container.
CA_BUNDLE_PATH = "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem"


class SignerProvider(object):
    def get(self):
        return oci.auth.signers.InstancePrincipalsSecurityTokenSigner()


class SSV2ClientWrapper:
    """
    Client Wrapper around the Secret Service client
    """

    def __init__(self, endpoint: str):
        """Constructor"""

        logger.debug("Getting instance principal token signer")

        # Creates a provider for InstancePrincipal Signer
        signer_provider = SignerProvider()

        logger.debug("Instantiating Secret Service V2 client with %s", endpoint)
        self.client = vaultpythonsdk.vault_client.VaultClient(
            signer_provider=signer_provider,
            service_endpoint=endpoint,
            ca_bundle_path=CA_BUNDLE_PATH
        )

    def get_secret(self, secret_path: str) -> str:
        """
        Get secret from Secret Service.
        Returns JSON string
        """

        logger.info("Getting secret at %s", secret_path)
        secret_details = self.client.get_secret(path=secret_path)
        base64_secret = secret_details.data.data["secret"]
        secret_json = base64.b64decode(base64_secret).decode("utf-8")
        return str(secret_json)