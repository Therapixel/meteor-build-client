// MODULES
var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var spawn = require('buffered-spawn');

// VARIABLES
const argPath = process.argv[2];
const basePath = './';
const buildPath = path.resolve(argPath);

// execute shell scripts
function execute(command) {
    return new Promise(function(resolve, reject) {
        spawn(command[0], command.slice(1), {
            cwd: basePath
        }, function(err, stdout, stderr) {
            if (err){
                console.log(err.message);

                reject(err);
            } else {
                resolve({
                    stdout: stdout,
                    stderr: stderr,
                });
            }
        });
    });
};

function deleteFolderRecursive(path) {
    var files = [];
    if (fs.existsSync(path)) {
        files = fs.readdirSync(path);
        files.forEach(function(file,index){
            var curPath = path + "/" + file;
            if(fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};


module.exports = {
    build: async function(program) {
        // remove the bundle folder
        deleteFolderRecursive(buildPath);

        var command = ['meteor', 'build', argPath, '--directory'];

        if (program.url) {
            command.push('--server');
            command.push(program.url);
        }

        return execute(command, 'build the app, are you in your meteor apps folder?');
    },
    move: async function() {
        try {
            _.each([
                '/bundle/programs/web.browser',
                '/bundle/programs/web.browser/app'
            ], function(givenPath){
                var clientPath = path.join(buildPath, givenPath);
                var rootFolder = fs.readdirSync(clientPath);
                rootFolder = _.without(rootFolder, 'app');

                rootFolder.forEach( function (file) {
                    var curSource = path.join(clientPath, file);

                    fs.renameSync(path.join(clientPath, file), path.join(buildPath, file));
                });
            });
        } catch(e) {
            // do nothing
        }
    },
    addIndexFile: async function(program) {
        var starJson = require(path.resolve(buildPath) + '/bundle/star.json');
        var settingsJson = program.settings ? require(path.resolve(program.settings)) : {};

        var content = fs.readFileSync(program.template || path.resolve(__dirname, 'index.html'), {encoding: 'utf-8'});
        var head;
        try{
            head = fs.readFileSync(path.join(buildPath, 'head.html'), {encoding: 'utf8'});
        } catch(e) {
            head = '';
            console.log('No <head> found in Meteor app...');
        }
        // ADD HEAD
        content = content.replace(/{{ *> *head *}}/,head);

        // get the css and js files
        var files = {css:[],js:[]};
        _.each(fs.readdirSync(buildPath), function(file){
            if(/^[a-z0-9]{40}\.css$/.test(file))
                files['css'].push(file);
            if(/^[a-z0-9]{40}\.js$/.test(file))
                files['js'].push(file);
        });

        // MAKE PATHS ABSOLUTE
        if(_.isString(program.path)) {

            // fix paths in the CSS file
            if(!_.isEmpty(files['css'])) {
                _.each(files['css'], function(css, i) {
                    var cssFile = fs.readFileSync(path.join(buildPath, css), {encoding: 'utf8'});
                    cssFile = cssFile.replace(/url\(\'\//g, 'url(\''+ program.path).replace(/url\(\//g, 'url('+ program.path);
                    fs.unlinkSync(path.join(buildPath, css));
                    fs.writeFileSync(path.join(buildPath, css), cssFile, {encoding: 'utf8'});

                    files['css'][i] = program.path + css;
                })
            }
            if(!_.isEmpty(files['js'])) {
                _.each(files['js'], function(jsFile, i) {
                    files['js'][i] = program.path + jsFile;
                })
            }
        } else {
            if(!_.isEmpty(files['css'])) {
                _.each(files['css'], function(cssFile, i) {
                    files['css'][i] = '/'+ cssFile;
                })
            }
            if(!_.isEmpty(files['js'])) {
                _.each(files['js'], function(jsFile, i) {
                    files['js'][i] = '/'+ jsFile;
                })
            }
        }


        // ADD CSS
        var css = [];
        _.each(files['css'], function(cssFile) {
            css.push('<link rel="stylesheet" type="text/css" class="__meteor-css__" href="'+ cssFile +'?meteor_css_resource=true">');
        })
        css = css.join("\n        ");
        content = content.replace(/{{ *> *css *}}/, css);

        // ADD the SCRIPT files
        var scripts = [];
        _.each(files['js'], function(jsFile) {
            scripts.push('__meteor_runtime_config__' + "\n" +
                '        <script type="text/javascript" src="'+ jsFile +'"></script>'+ "\n");
        })
        scripts = scripts.join("\n        ");

        // add the meteor runtime config
        settings = {
            'meteorRelease': starJson.meteorRelease,
            'ROOT_URL_PATH_PREFIX': '',
            meteorEnv: { NODE_ENV: 'production' },
            // 'DDP_DEFAULT_CONNECTION_URL': program.url || '', // will reload infinite if Meteor.disconnect is not called
            // 'appId': process.env.APP_ID || null,
            // 'autoupdateVersion': null, // "ecf7fcc2e3d4696ea099fdd287dfa56068a692ec"
            // 'autoupdateVersionRefreshable': null, // "c5600e68d4f2f5b920340f777e3bfc4297127d6e"
            // 'autoupdateVersionCordova': null
        };
        // on url = "default", we dont set the ROOT_URL, so Meteor chooses the app serving url for its DDP connection
        if(program.url !== 'default')
            settings.ROOT_URL = program.url || '';


        if(settingsJson.public)
            settings.PUBLIC_SETTINGS = settingsJson.public;

        scripts = scripts.replace('__meteor_runtime_config__', '<script type="text/javascript">__meteor_runtime_config__ = JSON.parse(decodeURIComponent("'+encodeURIComponent(JSON.stringify(settings))+'"));</script>');

        // add Meteor.disconnect() when no server is given
        if(!program.url)
            scripts += '        <script type="text/javascript">Meteor.disconnect();</script>';

        content = content.replace(/{{ *> *scripts *}}/, scripts);

        // write the index.html
        return new Promise((resolve, reject) => {
            let res;
            try {
                res = fs.writeFileSync(path.join(buildPath, `${program.filename}.html`), content);
            } catch (err) {
                reject(err);
            }
            resolve(res);
        });
    },
    cleanUp: async function() {
        // remove files
        deleteFolderRecursive(path.join(buildPath, 'bundle'));
        try {
            fs.unlinkSync(path.join(buildPath, 'program.json'));
        } catch (e) {
            console.log("Didn't unlink program.json as it doesn't exist.");
        }

        try {
            fs.unlinkSync(path.join(buildPath, 'head.html'));
        } catch (e) {
            console.log("Didn't unlink head.html as it doesn't exist.");
        }
    }
}
