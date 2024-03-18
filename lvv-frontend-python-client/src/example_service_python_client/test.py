import lvv_frontend
import oci

# To learn more about oci configuration, please refer to https://oracle-cloud-infrastructure-python-sdk.readthedocs.io/en/latest/configuration.html
# You can also use https://github.com/oracle/oci-cli to generate oci configuration for you.
config = oci.config.from_file()
# Note that when constructing the client you'll need to provide the ``service_endpoint`` keyword argument to the constructor
client = lvv_frontend.dummy_robot_client.LvvFrontendClient(config, service_endpoint="http://localhost:21000/20180828")
response = client.get_dummy_robot("ocid1.compartment.oc1..aaaaaaaa26mceal7cypzsefhbm2l73xtb3yreplacemereplacemereplaceme")
print response.data
