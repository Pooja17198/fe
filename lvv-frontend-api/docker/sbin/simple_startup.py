# This file is invoked as part of container startup, before runit is invoked.
import os
import logging
logger = logging.getLogger('sinit')

logging_root = "/logs"
executable_list = ["lvv-frontend-api", ]

class Startup(object):
    """
    simple_init.py will invoke Startup.do_startup() prior to invoking runit to manage
    the executables in this container.
    """
    def do_startup(self):
        """
        Method is called as part of simple_init startup, before runit is invoked.
        """
        logger.info("Logging directories: {}".format(executable_list))
        for e in executable_list:
            # create the root logging directories, such as /logs/[executable]
            self._create_logging_directory(os.path.join(logging_root, e))
        self._create_logging_directory(os.path.join(logging_root, 'chainsaw'))

        # --------------------------------------------------------------------------------
        # place any custom startup code here
        # --------------------------------------------------------------------------------


    def _create_logging_directory(self, log_dir):
        if not os.path.exists(log_dir):
            logger.info("Creating logging directory: {}".format(log_dir))
            os.makedirs(log_dir)
        else:
            logger.info("Logging directory: {} already exists, skipping.".format(log_dir))
