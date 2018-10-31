#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const _ = require('underscore');

// CLI Options
const program = require('commander');

const packageJson = require('./package.json');

// VARIABLES
const argPath = process.argv[2];
const meteor = require('./meteor.js');

program
    .version(packageJson.version)
    .usage('<output path> [options]')
    .option('-p, --path <path>', 'The path used to link the files, default is "/", pass "" to link relative to the index.html.')
    .option('-t, --template <file path>', 'Provide a custom index.html template. Use {{> head}}, {{> css}} and {{> scripts}} to place the meteor resources.')
    .option('-s, --settings <settings.json>', 'Set optional data for Meteor.settings in your application.')
    .option('-u, --url <url>', 'The Root URL of your app. If "default", Meteor will try to connect to the Server where it was served from. Default is: "" (empty string)')
    // .option('-d, --ddp <url>', 'The URL of your Meteor DDP server, e.g. "ddp+sockjs://ddp.myapp.com/sockjs". If you don\'t add any it will also add call "Meteor.disconnect();" to prevent the app from conneting.')
    .option('-f, --filename <filename>', 'The filename to use for naming files. Defaults is: "index"', 'index');

program.on('--help', function() {
    console.log('  Warning:');
    console.log('');
    console.log('  The content of the output folder will be deleted before building the new output!');
    console.log('  Don\'t do something like: meteor-build-client /home !');
    console.log('');
});

program.parse(process.argv);

async function run() {
    if (!argPath) {
        throw new Error("You need to provide a path for the build output, for example:\n\n$ meteor-build-client myBuildFolder");
    }

    if (!fs.lstatSync('./.meteor').isDirectory()) {
        throw new Error('You\'re not in a Meteor app folder or inside a sub folder of your app.');
    }

    if(program.template && !fs.lstatSync(program.template).isFile()) {
        throw new Error('The template file "'+ program.template +'" doesn\'t exist or is not a valid template file');
    }

    console.log('Bundling Meteor app...');

    await meteor.build(program);

    console.log(`Moving Meteor app bundle...`);

    await meteor.move();

    console.log(`Generating the ${program.filename}.html...`);

    await meteor.addIndexFile(program);

    console.log('Cleaning up...');

    await meteor.cleanUp();

    console.log('Done!');
    console.log('-----');
    console.log('You can find your files in "'+ path.resolve(argPath) +'".');
}

try {
    run();
} catch (err) {
    if (err.stderr || err.stdout) {
        console.error(err.stdout, err.stderr);
    } else {
        console.error(err);
    }

    process.exit(-1);
}
