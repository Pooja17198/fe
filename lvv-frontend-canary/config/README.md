Configuration files go here.
See https://github.com/lightbend/config for information about the configuration library.

## Structure

The `run.sh` file attempts to load config files in the following order:
1: The config file passed in as input, e.g. `./run.sh myconfig.conf`
1: If the environment variable `ENV_OVERRIDE` is set, then `${ENV_OVERRIDE}.conf will be loaded
1: On desktops, if `${USER}.conf` exists, it will be used
1: If on a desktop, `desktop.conf` will be used if it exists
1: `${ad}-${region}.conf will be uses if it exists where ad and region are loaded from `/etc/region` and `/etc/availability-domain`. E.g. r2-ad1.conf, us-ashburn-1-ad2.conf
1: `${region}` if it exists where region comes from `/etc/region`
1: `${stage}` which is `prod.conf`

If none of the above are found, the service will fail to start.

* base.conf
  * dev.conf
    * desktop.conf
  * prod.conf
    * oc1.conf
      * r2.conf
        * r2-ad1.conf
