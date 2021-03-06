'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as an from './runner';
import { Lint } from './lint';
import { platform } from 'os';
import { join } from 'path';
import { each, isNull } from 'lodash';
import { existsSync } from 'fs';
import { analysisResult } from './lint'

let disposables: Set<any>;
let config: {[key:string]:any};
let outputChannel: vscode.OutputChannel;
let statusItem: vscode.StatusBarItem;
let timer:NodeJS.Timer;

let diagnosticCollection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection('cpplint');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('CppLint');
    // outputChannel.appendLine('CppLint is running.');
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "cpplint" is now active!');

    readConfiguration()

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json

    let single = vscode.commands.registerCommand('cpplint.runAnalysis', runAnalysis);
    context.subscriptions.push(single);

    // workspace mode does not regist event
    let whole = vscode.commands.registerCommand('cpplint.runWholeAnalysis', runWholeAnalysis);
    context.subscriptions.push(whole);
}

function runAnalysis() : Promise<void> {
    var edit = vscode.window.activeTextEditor;
    if (!edit) {
        return;
    }
    let filename = vscode.window.activeTextEditor.document.fileName;
    let workspace = vscode.workspace.rootPath;
    filename = filename.slice(workspace.length + 1, filename.length);
    let result = an.runOnFile(filename, workspace, config);

    outputChannel.show();
    outputChannel.clear();
    outputChannel.appendLine(result);

    // vscode.window.showInformationMessage(edit.document.uri.fsPath)
    return Promise.resolve()
}

function runWholeAnalysis() : Promise<void> {
    var edit = vscode.window.activeTextEditor;
    if (!edit) {
        return;
    }
    let filename = vscode.window.activeTextEditor.document.fileName;
    let workspace = vscode.workspace.rootPath;
    filename = filename.slice(workspace.length + 1, filename.length);

    let result = an.runOnWorkspace(filename, workspace, config);

    outputChannel.show();
    outputChannel.clear();
    outputChannel.appendLine(result);
    // vscode.window.showInformationMessage(edit.document.uri.fsPath)
    return Promise.resolve()
}

// this method is called when your extension is deactivated
export function deactivate() {
    clearTimeout(timer)
    vscode.window.showInformationMessage("Cpplint deactivated")
}

function doLint() {
    let language = vscode.window.activeTextEditor.document.languageId
    if(language == "c" || language == "cpp") {
        if (config['lintMode'] == 'workspace') {
            Lint(diagnosticCollection, config, true);
        } else {
            Lint(diagnosticCollection, config, false);
        }
    }
    clearTimeout(timer)
}

function startLint() {
    timer = global.setTimeout(doLint, 1.5*1000);
}

function findCpplintPath(settings: vscode.WorkspaceConfiguration) {
    let cpplintPath = settings.get('cpplintPath', null);

    if (isNull(cpplintPath)) {
        let p = platform();
        if (p === 'win32') {
            // TODO: add win32 and win64 cpplint path
        }
        else if (p === 'linux' || p === 'darwin') {
            let attempts = [ '/usr/local/bin/cpplint' ];
            for (let index = 0; index < attempts.length; index++) {
                if (existsSync(attempts[index])) {
                    cpplintPath = attempts[index];
                    break;
                }
            }
        }
    }

    return cpplintPath;
}

function readConfiguration() {
    config = {};
    let settings = vscode.workspace.getConfiguration('cpplint');

    if (settings) {
        var cpplintPath = findCpplintPath(settings);

        if (!existsSync(cpplintPath)) {
            vscode.window.showErrorMessage('Cpplint: Could not find cpplint executable');
        }

        config['cpplintPath'] = cpplintPath;

        var linelength = settings.get("lineLength", 80);
        config['lineLength'] = linelength;

        var lintmode = settings.get('lintMode', 'single');
        config['lintMode'] = lintmode;

        var excludes = settings.get('excludes', [])
        config['excludes'] = excludes; 

        var filters = settings.get("filters", [])
        config["filters"] = filters;

        config["filters"].forEach(element => {
            if (element[0] != '-' && element[0] != '+') {
                vscode.window.showErrorMessage("filter [" + element+ '] must start with + or -, please check your settings');
                return false;
            }
        });

        var verbose = settings.get("verbose", 0)
        config['verbose'] = verbose;

        if(config['lintMode'] == 'single') {
            vscode.workspace.onDidOpenTextDocument((() => doLint()).bind(this));
            vscode.workspace.onDidSaveTextDocument((() => doLint()).bind(this));
        } else {
            // start timer to do workspace lint
            startLint();
            vscode.workspace.onDidSaveTextDocument((() => startLint()).bind(this));
        }

    }
}