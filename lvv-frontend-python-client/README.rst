Example Service Python Client
========================================

To build & test it:
----------------------------
1. Make sure that service is running.
    ./lvv-frontend/run.sh
2. Build the Python client:
    cd lvv-frontend-python-client
    mvn clean install
3. Install the Python client:
    virtualenv venv
    source venv/bin/activate
    python setup.py install
4. Run the test script:
    python src/lvv-frontend-python-client/test.py

To Publish Wheel and Tar
----------------------------
1. Follow step 2 above to build the artifacts
2. Build the wheel and Tar file:
    python setup.py sdist bdist_wheel
3. Install twine if needed:
    pip install twine
4. Setup ~/.pypirc or export the following:
    TWINE_REPOSITORY_URL=<pypi repo, not maven repo>
    TWINE_USERNAME (optional, will prompt if not set)
    TWINE_PASSWORD (optional, will prompt if not set)

4. Step 2 will make a dist folder, this can be published via:
    python3 -m twine upload dist/*
