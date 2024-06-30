# This file is invoked as part of container startup, before runit is invoked.
import os
import logging
logger = logging.getLogger("sinit")

logging_root = "/logs"
executable_list = ["nginx"]


class Startup(object):
    """
    simple_init.py will invoke Startup.do_startup() prior to invoking runit to manage
    the executables in this container.
    """
    def do_startup(self):
        """
        Method is called as part of simple_init startup, before runit is invoked.
        """
        logger.info("Logging directories: %s", executable_list)
        for e in executable_list:
            # create the root logging directories, such as /logs/[executable]
            self._create_logging_directory(os.path.join(logging_root, e))
            # create the runit logging directories, such as /logs/runit/[executable]
            self._create_logging_directory(os.path.join(logging_root, 'runit', e))

        # --------------------------------------------------------------------------------
        # place any custom startup code here
        # --------------------------------------------------------------------------------

        # Fetch the nginx cert
        os.system("source env/bin/activate && python3 /scripts/ssv2/update_cert.py")

    @staticmethod
    def _create_logging_directory(log_dir):
        if not os.path.exists(log_dir):
            logger.info("Creating logging directory: %s", log_dir)
            os.makedirs(log_dir)
        else:
            logger.info("Logging directory: %s already exists, skipping.", log_dir)
