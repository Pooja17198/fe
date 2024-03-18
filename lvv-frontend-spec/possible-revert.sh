#!/bin/bash

# Exit this script if it's not in a git repository or don't have a remote tracking repository.
if git remote && [ -n "$(git remote -v)" ]; then
    echo "Repo has remote tracking branch, checking spec validation output."
else
    echo "Not in a git repository or don't have a remote tracking repo, ignoring validation revert."
    exit 0
fi

# get the name of the remote repository (might not be 'origin')
remote=`git remote`

# get the relative path from current directory to git top-level directory (might not be one level down)
relativePath=`git rev-parse --show-prefix`

# Spec validator creates spec-validation-output-*.txt files. The files change on every build even when
# there are no relevant spec changes, which is a nuisance.
# This script reverts those output files if no changes to the spec are made.
echo Checking for new Swagger
spec_change=`git diff $remote/master "src/specs/*.yaml"`
config_change=`git diff $remote/master "*-config.yaml"`
pom_change=`git diff $remote/master pom.xml`
if [ "$spec_change" = "" ] && [ "$config_change" = "" ] && [ "$pom_change" = "" ]
then
    echo No changes, reverting validation
    for validationOutput in spec-validation-output*.txt; do
        if git cat-file -e $remote/master:$relativePath$validationOutput; then
            echo reverting file $validationOutput
            git checkout -- $validationOutput
        else
            echo "$validationOutput doesn't exist in tracking repo, ignoring."
        fi
    done
fi
