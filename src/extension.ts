import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

const cppcheckOutput = vscode.window.createOutputChannel(`cppcheck`);

export function activate(context: vscode.ExtensionContext) {

    // Collezione per la diagnostica
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('cppcheck');
    context.subscriptions.push(diagnosticCollection);

    // Comando per il singolo file
    let disposableFile = vscode.commands.registerCommand('cppchecksr.analizzaFile', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const filePath = editor.document.fileName;
            runCppcheck(filePath, diagnosticCollection);
        } else {
            vscode.window.showErrorMessage('Nessun file aperto da analizzare.');
        }
    });

    // Comando per l'intero progetto (cartella workspace attiva)
    let disposableProject = vscode.commands.registerCommand('cppchecksr.analizzaProgetto', () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Nessun progetto aperto nel workspace.');
            return;
        }
        
        // Utilizziamo la cartella principale del workspace
        const projectPath = workspaceFolders[0].uri.fsPath;
        runCppcheck(projectPath, diagnosticCollection, true);
    });

    context.subscriptions.push(disposableFile, disposableProject);
}

async function runCppcheck(targetPath: string, diagnosticCollection: vscode.DiagnosticCollection, isProject: boolean = false)
{
    // leggo le configurazioni
    const config = vscode.workspace.getConfiguration(`cppchecksr`);

    const abilitata = config.get<boolean>(`enable`,true);
    if (!abilitata) {
        console.log("cppchecksr: estensione disabilitata");
        return;
    }
    
    const stdSel = config.get<string>(`cppStandard`,`c++17`);
    const addON = config.get<string>(`addOn`,`none`);
    const extraArgs = config.get<string>(`extraArgs`,``);

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    
    // genero il comando da lanciare per singolo file o progetto
    const workspacePath = workspaceFolders[0].uri.fsPath;
    let compileCommandsPath: String | undefined;

    if (isProject)
    {
        compileCommandsPath = await getPathCompile();
        if(!compileCommandsPath) {return;}
    }
    else
    {
        compileCommandsPath = path.join(workspacePath, `build`, `compile_commands.json`);
    }

    let command = `cppcheck --enable=all --suppress=missingIncludeSystem --xml --std=${stdSel}`;

    if(addON !== "none") {command += ` --addon=${addON}`;};
    if(extraArgs.trim() !== ``) {command += ` ${extraArgs.trim()}`;};

    if (isProject)
    {
        command += ` --project="${compileCommandsPath}"`;
    }
    else
    {
        command += ` ${targetPath}`;
    }

    // comandi da lanciare stampati nel canale di output
    cppcheckOutput.show(true);
    //cppcheckOutput.clear();

    cppcheckOutput.appendLine("---------------------------------------------------------------------------");
    cppcheckOutput.appendLine(`[${new Date().toLocaleTimeString()}] cppcheck in corso...`);
    cppcheckOutput.appendLine("comando lanciato:");
    cppcheckOutput.appendLine(command);

    // eseguo il comando
    cp.exec(command, (err: any, stdout: any, stderr: any) => {
        // Cppcheck scrive l'XML e i messaggi di errore su stderr quando si usa --xml
        const output = stderr ? stderr : stdout;

        if (output && (output.includes('<error') || output.includes('</results>')))
        {
            diagnosticCollection.clear();
            parseAndShowDiagnostics(output, diagnosticCollection);
            cppcheckOutput.appendLine("cppcheck eseguito con successo");
        } 
        else if (err)
        {
            // Mostriamo l'errore esplicito di Cppcheck
            cppcheckOutput.appendLine(`cppcheck non eseguito per errore: ${err.message}`);
            vscode.window.showErrorMessage(`Errore Cppcheck: ${stderr || err.message}`);
            return;
        }
        else
        {
            cppcheckOutput.appendLine("cppcheck non ha rilevato errori o non ha riconosciuto output");
        }
    });
}

async function getPathCompile():Promise<string | undefined>
{
    const files = await vscode.workspace.findFiles('**/compile_commands.json');

    if(files.length === 0)
    {
        vscode.window.showErrorMessage(`nessun file compile_commands.json trovato dentro il workspace`);
        return undefined;
    }
    if(files.length === 1)
    {
        return files[0].fsPath;
    }

    const selProgetto = files.map(file => {
        const folderName = path.basename(path.dirname(path.dirname(file.fsPath)));
        return {
            label: `Progetto: ${folderName}`,
            description: file.path,
            targetUri: file
        };
    });

    const selezionato = await vscode.window.showQuickPick(selProgetto,
        {placeHolder: `seleziona il progetto da analizzare`});

    return selezionato ? selezionato.targetUri.fsPath : undefined;
}

function decodeXmlEntities(str: string): string {
    return str
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function parseAndShowDiagnostics(xmlOutput: string, diagnosticCollection: vscode.DiagnosticCollection) {
    const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();
    
    // Regex per parsare l'XML di Cppcheck
    const errorRegex = /<error id="([^"]+)" severity="([^"]+)" msg="([^"]+)" ([\s\S]*?)<\/error>/g;
    let match;

    while ((match = errorRegex.exec(xmlOutput)) !== null) {
        const severity = match[2];
        const msg = decodeXmlEntities(match[3]);
        
        const locationRegex = /file="([^"]+)" line="([^"]+)"/g;
        const locMatch = locationRegex.exec(match[4]);

        if (locMatch) {
            const filePath = locMatch[1];
            const line = parseInt(locMatch[2], 10) - 1; // Le linee partono da 0 in VS Code

            const uri = vscode.Uri.file(filePath);
            const range = new vscode.Range(line, 0, line, 100); 

            let vsCodeSeverity = vscode.DiagnosticSeverity.Information;
            if (severity === 'error') {
                vsCodeSeverity = vscode.DiagnosticSeverity.Error;
            } else if (severity === 'warning' || severity === 'style') {
                vsCodeSeverity = vscode.DiagnosticSeverity.Warning;
            }

            const diagnostic = new vscode.Diagnostic(range, msg, vsCodeSeverity);
            diagnostic.source = 'Cppcheck';

            if (!diagnosticsMap.has(filePath)) {
                diagnosticsMap.set(filePath, []);
            }
            diagnosticsMap.get(filePath)!.push(diagnostic);
        }
    }

    // Aggiorna la collezione
    for (const [filePath, diagnostics] of diagnosticsMap.entries()) {
        diagnosticCollection.set(vscode.Uri.file(filePath), diagnostics);
    }

    if (diagnosticsMap.size > 0) {
        vscode.window.showInformationMessage('Analisi Cppcheck completata. Controlla il pannello Problemi.');
    } else {
        vscode.window.showInformationMessage('Cppcheck non ha rilevato problemi.');
    }
}

export function deactivate() {}