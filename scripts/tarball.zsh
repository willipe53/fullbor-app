#!/bin/zsh

cd ..

echo " --> usage: tarball.py 0890b380bec2879c3b037d6679a29e39fd05315d"

commit="$1"
if [ "$1" = "" ]; then exit 1; fi

tag_name="${commit:0:5}"
dir_name="/Users/willipe/github/${tag_name}/"

if [ -d "$dir_name" ]; then
  rm -rf "$dir_name"
fi

mkdir "$dir_name"

echo "Creating tarball at ${dir_name} from ${commit}"

cmd="/usr/bin/git tag -a ${tag_name} -m ${tag_name} ${commit}"

eval $cmd

cmd="/usr/bin/git archive ${tag_name} | tar -x -C ${dir_name}"

eval $cmd

cd $dir_name

npm install
