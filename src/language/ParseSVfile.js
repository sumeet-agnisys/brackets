define(function (require, exports, module) {
    "use strict";
    var isDebug=false;

    var _ = require("thirdparty/lodash");

    var DViHelper           = require("language/DViHelper"),
        FileSystem          = require("filesystem/FileSystem"),
        ExtensionUtils      = require('utils/ExtensionUtils'),
        ParserUtils      	= brackets.getModule("parserutils/ParserUtils"),
        logger				= require('language/logger');
    //fs                  = require("fs");

    var crx = /\r/g,
        crlfx = /\r\n/g,
        blockCommentBegin = /(.*?)\/\*/,
        blockCommentEnd = /\*\/(.*)/,
        SLComment = /(.*)\/\//,
        blankLine = /^\s*$/,
        extendsRegex = /class\s+\w+\s+(#[(),\s\w=:\[\]\"\"]+[^\s+])?\s*extends\s+((#[(),\s\w=:\[\]\"\"]+[^\s+])\s+)?(\w+)/,
        callingSuperConstructor = /^\s*super\.new/,
        externNameSolver = /(.*?)::(.*)/,
        typeDefClass = /^\s*typedef\s+class/,
        argsClosing = /.+;/,
        externRegex = /\s*(extern)\s*/,
        utilsRegex = /\`(uvm_((object|component)(_param)?)_utils)\((\w+)\s*(#\(\s*(.+)?\s*\))?\)/,
        factoryCreation = /\s*(\w+)(\[([^\]]+)?\])?\s*=\s*(\w+)\s*(#\s*\(([^)]+)\)\s*)?::type_id::create\(\s*([^),]+)\s*(,\s*([^),]+)\s*)+\)\s*;/,
        portConnect = /\s*(([^\.]+\.)+)?(\w+)\s*(\[[^\.]+\])?\.connect\s*\(\s*((([^\.]+\.)+)?(\w+)\s*(\[[^\.]+\])?)\s*\)/,
        // to understand these regex try using "https://www.debuggex.com/"
        classHandle = /^\s*((?!(virtual|typedef)?(class|function|task)))(((\w+)\s+)+)(\#\(.*?\)\s+)?(((\w+)\s*(\[([^\]]*?)\])?\s*)((,\s*(\w+)\s*(\[([^\]]*?)\])?\s*)+)?)(=new\(.*?\)|;)/,

        struct_union_Regex = /^\s*((typedef)\s+)?\s*(struct|union)\s+(packed\s+((signed|unsigned))?)?\s*(.*)/,
        paramDecodeRegex = /(\w+)\s*(=\s*\w+\s*)?$/,
        currlyBracesAtEnd = /.+\}\s*/,
        errorType = {
            error : "problem_type_error",
            warning : "problem_type_warning"
        },

        dataTypes = ["bit", "buf", "bufif0", "bufif1", "byte", "const", "enum", "event", "genvar", "highz0", "highz1", "inout", "input", "int", "integer", "longint", "parameter", "protected", "pull0", "pull1", "pulldown", "pullup", "pure", "rand", "randc", "real", "realtime", "reg", "rnmos", "rpmos", "rtran", "rtranif0", "rtranif1", "shortint", "shortreal", "signed", "static", "string", "strong", "strong0", "strong1", "supply0", "supply1", "time", "tranif0", "tranif1", "tri", "tri0", "tri1", "triand", "trior", "trireg", "var", "weak", "weak0", "weak1"],

        startings = {
            "function" : /^(\s*(extern\s+)?((((static|protected|local))(\s+(pure\s)?\s*virtual)?\s+)|(((pure\s)?\s*virtual)(\s+(static|protected|local))?)\s+)?function\s+(automatic|static)?\s*(signed|unsigned)?\s*(\[[$a-zA-Z0-9:]+\])?\s*(([a-zA-Z_$:{}\[\]0-9]+\s+)+)?\s*([$_A-Za-z][:$_A-Za-z0-9]*)\s*(\([^\)]*)?)/,
            "task" : /^(\s*(extern\s+)?((((static|protected|local))(\s+(pure\s)?\s*virtual)?\s+)|(((pure\s)?\s*virtual)(\s+(static|protected|local))?)\s+)?task\s+(automatic|static)?\s*(([a-zA-Z_$:{}\[\]0-9]+\s+)+)?\s*([$_A-Za-z][:$_A-Za-z0-9]*)\s*(\([^\)]*)?)/,
            "class" : /((^class)|(\s+class))\s+((static|automatic)\s+)?\s*(\w+)\s*(#\(([\s\w=:,\[\]\"\"]+)\))?/,
            "module" : /((^module)|(\s+module))\s+((static|automatic)\s+)?\s*(\w+)\s*(#\([\s\w=:,\[\]]+\))?(.*)/,
            "begin" : /((^begin)|(\s+begin))\s/
        },
        endings = {
            "function" : /((^endfunction)|(\s+endfunction))(\s*\:\s*((\w)*))?\s*;?\s*$/,
            "task" : /((^endtask)|(\s+endtask))(\s*\:\s*((\w)*))?\s*;?\s*$/,
            "class" : /((^endclass)|(\s+endclass))((\s+)?\:\s*(\w+)?)?\s*;?\s*/,
            "module" : /((^endmodule)|(\s+endmodule))((\s+)?\:\s*(\w+)?)?\s*;?\s*/,
            "begin" : /((^end)|(\s+end))((\s*\:\s*(\w+)?))?\s*/
        };    

    function removeComments(lines) {
        if(ParserUtils._isDebugOn())console.log("---removeComments calling...");

        var i,
            uncommentedLines = [],
            validLine = true;
        var commentBeforLine = [];
        var inLineComments = [];
        var inLineCommentFlag = false;
        var commentBeforLineFlag = false; 
        var _isValidLine=false;
        var _isMultiBlockCmmtStart=false;
        try{
            for (i in lines) {
                _isValidLine=true;
                var currLine = lines[i];
                if(ParserUtils._isDebugOn())console.log("--currLine : "+currLine);

                if (commentBeforLineFlag === "entered") {
                    commentBeforLineFlag = "append";
                }

                //block Comments within a single line
                while ((blockCommentBegin.exec(currLine) !== null) && (blockCommentEnd.exec(currLine) !== null)) {
                    var match1 = blockCommentBegin.exec(currLine);
                    var match2 = blockCommentEnd.exec(currLine);
                    inLineComments.push({
                        text : currLine.substr(currLine.indexOf("/*"),currLine.indexOf("*/") + 2),
                        from : {
                            line : Number(i),
                            ch : currLine.indexOf("/*")
                        },
                        to : {
                            line : Number(i),
                            ch : currLine.indexOf("*/") + 2
                        }
                    });
                    if (currLine.substr(currLine.indexOf("/*"),currLine.indexOf("*/") + 2).match(/dvi\s*ignore/i)) {
                        inLineComments.DViIgnore = true;
                    }
                    inLineCommentFlag = true;
                    currLine = match1[1] + match2[1];

                    _isValidLine=false;
                }

                //single line comments
                if (currLine.indexOf("//") !== -1) {
                    if(ParserUtils._isDebugOn())console.log("---singleline comment Regex pass ");
                    var match = currLine.indexOf("//");
                    var precidingText = currLine.substr(0, match);
                    if (blankLine.exec(precidingText) === null) {
                        inLineComments.push({
                            text : currLine.substr(match,currLine.length),
                            from : {
                                line : Number(i),
                                ch : match
                            },
                            to : {
                                line : Number(i),
                                ch : currLine.length - 1
                            }
                        });
                        if (currLine.substr(match,currLine.length).match(/dvi\s*Ignore/i)) {
                            inLineComments.DViIgnore = true;
                        }
                        inLineCommentFlag = true;
                    } else {
                        commentBeforLine.push({
                            text : currLine,
                            from : {
                                line : Number(i),
                                ch : 0
                            },
                            to : {
                                line : Number(i),
                                to : currLine.length - 1
                            }
                        });
                        commentBeforLineFlag = "entered";
                    }
                    currLine = currLine.substr(0, match);
                    _isValidLine=false;
                }

                //multi line block comment start
                else if (blockCommentBegin.exec(currLine) !== null) {
                    if(ParserUtils._isDebugOn())console.log("---multiline block comment start Regex pass ");
                    var match = blockCommentBegin.exec(currLine);
                    if (blankLine.exec(match[1]) === null) {
                        var remainingString = match[1];
                        var quoteCount = 0;
                        var quoteStrings = {};
                        while(/"(((\\")?[^"]?)*)"/.exec(remainingString)!== null) {
                            quoteCount += 1;
                            var match = /"(((\\")?[^"]?)*)"/.exec(remainingString);
                            remainingString = remainingString.replace(/"(((\\")?[^"]?)*)"/, "Some_Quoted_Text_" + quoteCount);
                            quoteStrings["Some_Quoted_Text_" + quoteCount] = match[1];
                        }
                        if(ParserUtils._isDebugOn())console.log("--blankLine exec cond \n ---text : "+remainingString);

                        uncommentedLines.push({ text: remainingString, lineNum : Number(i), origLine : lines[i], quoteStrings : quoteStrings});
                    }
                    validLine = false;
                    commentBeforLine.push({
                        text : currLine.substr(currLine.indexOf("/*"),currLine.length),
                        from : {
                            line : Number(i),
                            ch : currLine.indexOf("/*")
                        },
                        to : {
                            line : Number(i),
                            ch : currLine.length - 1
                        }
                    });
                    commentBeforLineFlag = "entered";
                    _isValidLine=false;
                    _isMultiBlockCmmtStart=true;
                }

                //multi line block comment end 
                else if (blockCommentEnd.exec(currLine) !== null) {                    
                    if(ParserUtils._isDebugOn())console.log("---multiline block comment end Regex pass ");
                    var match = blockCommentEnd.exec(currLine);
                    commentBeforLine.push({
                        text : currLine.substr(0,currLine.indexOf("*/") + 1 ),
                        from : {
                            line : Number(i),
                            ch : 0
                        },
                        to : {
                            line : Number(i),
                            to : currLine.indexOf("*/") - 1
                        }
                    });
                    currLine = match[1];
                    validLine = true;
                    _isValidLine=false;
                    _isMultiBlockCmmtStart=false;
                }

                else{
                    //if(ParserUtils._isDebugOn())console.log("---blockCommentEnd Regex failed ");
                }






                if(_isMultiBlockCmmtStart){
                    _isValidLine=false;
                    if(ParserUtils._isDebugOn())console.log("---_isMultiBlockCmmtStart condition true");                    
                }
                /*
                if (blankLine.exec(currLine) === null){
                    if(ParserUtils._isDebugOn())console.log("---line is null ");    
                    _isValidLine=false;
                }
                */
                if(ParserUtils._isDebugOn())console.log("---Is current line is valid "+_isValidLine);


                //if (validLine) //sumeet::old condition, true only when file have multiline block comment
                if(_isValidLine)
                {
                    if(ParserUtils._isDebugOn())console.log("---validLine ");
                    var quoteCount = 0;
                    var quoteStrings = {};
                    while(/"(((\\")?[^"]?)*)"/.exec(currLine) !== null) {
                        quoteCount += 1;
                        var match = /"(((\\")?[^"]?)*)"/.exec(currLine);

                        //new code start
                        /*
                        try{
                            console.log("----+++=="+currLine.lastIndexOf("`include",0));
                            //console.log("--currentLinnne "+currLine);
                            if(currLine.indexOf("`include")==1){
                                //alert("find include");
                                currLine=match[1];
                                //alert("match[1] "+currLine);
                            }
                            else{
                                alert("not found include");
                                currLine = currLine.replace(/"(((\\")?[^"]?)*)"/, "Some_Quoted_Text_" + quoteCount);
                                quoteStrings["Some_Quoted_Text_" + quoteCount] = match[1];
                            }
                        }
                        catch(Ex){
                            alert("Err(removeCOmment) "+Ex.message);
                        }
                        */
                        //new code end


                        window.includeObj=new Object();

                        if(currLine.indexOf("`include")==1){
                            //alert("find include");
                            try{
                                //window.includeObj.type="include";
                                window.includeObj.path=match[1];
                                //alert("match[1] "+currLine);
                            }
                            catch(Ee){
                                alert("Err(include)2 "+Ee.message);
                            }
                        }
                        else{
                            // window.includeObj.type="other";
                        }
                        //old code start
                        currLine = currLine.replace(/"(((\\")?[^"]?)*)"/, "Some_Quoted_Text_" + quoteCount);
                        quoteStrings["Some_Quoted_Text_" + quoteCount] = match[1];
                        //old code end
                    }
                    //                currLine = currLine.replace(/"(((\\")?[^"]?)*)"/g, "\"Some_Quoted_Text\""); // removing quoted text
                    if (blankLine.exec(currLine) === null) {

                        if(ParserUtils._isDebugOn())console.log("---single line comments \n---text : "+currLine);


                        uncommentedLines.push({ text: currLine, lineNum : Number(i), origLine : lines[i], quoteStrings : quoteStrings}); // colllecting comment free and quoted-text free lines.
                        if (inLineCommentFlag) {
                            uncommentedLines[uncommentedLines.length -1].inLineComments = inLineComments;
                            inLineCommentFlag = false;
                            inLineComments = [];
                        }
                        if (commentBeforLineFlag === "append") {
                            uncommentedLines[uncommentedLines.length -1].commentsBeforThisLine = commentBeforLine;
                            commentBeforLineFlag = false;
                            commentBeforLine = [];
                        }
                    }
                    else{
                        if(ParserUtils._isDebugOn())console.log("--- blankLine ===null condition");   
                    }
                } 
                else {
                    if(ParserUtils._isDebugOn())console.log("---InValidLine ");

                    if (commentBeforLineFlag === "append") {
                        commentBeforLine.push({
                            text : currLine,
                            from : {
                                line : Number(i),
                                ch : 0
                            },
                            to : {
                                line : Number(i),
                                to : currLine.length - 1
                            }
                        });
                    }
                }
            }
            return uncommentedLines;
        }
        catch(E){
            if(ParserUtils._isDebugOn())console.log("Err (removeComments) "+E.message);   
        }
    }

    function parseSVfile(lines, path, ignoreBaseClass) {
        if (!lines && path) {
            try{
                var obj;
                path = path.replace(/\\/g,"/");
                var fr = require("language/filereader");
                var file = FileSystem.getFileForPath(path);
                if (file._content) {
                    lines = file._content
                    .replace(crlfx, '\n')
                    .replace(crx, '\n')
                    .split('\n');
                    lines = removeComments(lines);
                    /*
                console.log("--path false cond");
                try{
                    for (i = 0; i <= (5); ++i){
                        console.log("currLine : "+lines[i].text);
                    }
                }
                catch(E){
                    alert("Err (parseSVFile) : "+E.message)   
                }
                */

                } else {
                    $.ajaxSetup({async: false});
                    var fileData = $.get(path);
                    $.ajaxSetup({async: true});
                    if (fileData.readyState === 4 && fileData.statusText === "success") {
                        lines = fileData.responseText
                        .replace(crlfx, '\n')
                        .replace(crx, '\n')
                        .split('\n');
                        lines = removeComments(lines);
                        //console.log("--length of lines : "+lines.length);

                        /*
                    console.log("--path true cond");
                    try{
                        for (i = 0; i <= (5); ++i){
                            console.log("currLine : "+lines[i].text);
                        }
                    }
                    catch(E){
                        alert("Err (parseSVFile) : "+E.message)   
                    }
                    */
                    }
                }
                if (!lines) {
                    return null;
                }

                //            var util = require("language/lib/util");
                //            var path = require("language/lib/path");
                //            var fs = require("fs");
                //            obj = appshell.fs.readFile(path,null,function(err,data) {
                //                if (!err) {
                //                    obj = data;
                //                          }
                //            });
                //            var file = FileSystem.getFileForPath(path);
                //            file.read(function (err, data) {
                //                obj = data;
                //            });
                //            if (obj) {
                //                lines = obj;
                //                lines = lines
                //                .replace(crlfx, '\n')
                //                .replace(crx, '\n')
                //                .split('\n');
                //                lines = removeComments(lines);
                //            } else {
                //            }
            }catch(EX){
                if(isDebug)console.log("Err (parseSVfile1) "+EX.message )   ;
            }
        }

        var i,
            classStarted = false,
            moduleStarted = false,
            functionStarted  = false,
            taskStarted = false,
            findings = [],
            match,
            currClass = "NoClass",
            currModule = "NoModule",
            currFunction = "",
            currTask = "",
            parentOfExtern = "",
            argumentComplete = true,
            argguments = "",
            arggumentsFor,
            includeArgs = false;
        var startTime = new Date();

        if (lines.length > 0) {
            logger.log("[ParseSV " + new Date().getHours() + ":" + new Date().getMinutes() + ":" + new Date().getSeconds() + 
                       ":" + new Date().getMilliseconds() + "] Parsing Start.");
            for (i = 0; i <= (lines.length - 1); ++i) {
                try{
                    var currLine = lines[i],
                        currLineText = currLine.text;
                    if (!argumentComplete) {
                        currLineText = currLineText.replace(/^\s+/g, " ");
                        var currLineForArgs = currLineText;
                        if (currLine.quoteStrings) {
                            var quoteStringsID;
                            for (quoteStringsID in currLine.quoteStrings) {
                                currLineForArgs = currLineForArgs.replace(new RegExp(quoteStringsID,"g"),currLine.quoteStrings[quoteStringsID]);
                            }
                        } 
                        argguments = argguments + currLineForArgs;
                        if (arggumentsFor === "structDec") {
                            var startBracesCount = countCharInLine("{", argguments);
                            var endBracesCount   = countCharInLine("}", argguments);
                            if (startBracesCount === endBracesCount) {
                                match = struct_union_Regex.exec(argguments);
                                if (match[7]) {
                                    var structBodyRegex = /\{(.+)\}\s*(.+)\s*;/;
                                    var match1 = structBodyRegex.exec(match[7]);
                                    var structBody = match1[1].split(";");
                                    var temp = structBody.pop();
                                    var top = "";
                                    var child = "";
                                    if (classStarted) {
                                        top = currClass;
                                    } else if (moduleStarted) {
                                        top = currModule;
                                    }
                                    if (functionStarted || taskStarted) {
                                        if (functionStarted) {
                                            if (match[2]) {
                                                if (!findings[top].functions[currFunction].structures) {
                                                    findings[top].functions[currFunction].structures = {};
                                                }
                                                findings[top].functions[currFunction].structures[match1[2]] = {
                                                    structMembers : structBody
                                                };
                                            } else  {
                                                if (!findings[top].functions[currFunction].members) {
                                                    findings[top].functions[currFunction].members = {};
                                                }
                                                var varNames = match1[2].split(",");
                                                var eachVarName;
                                                for (eachVarName in varNames) {
                                                    var currVarName = varNames[eachVarName];
                                                    findings[top].functions[currFunction].members[currVarName] = {
                                                        type : "structure",
                                                        structMembers : structBody
                                                    };
                                                }
                                            }
                                        } else if (taskStarted) {
                                            if (match[2]) {
                                                if (!findings[top].tasks[currTask].structures) {
                                                    findings[top].tasks[currTask].structures = {};
                                                }
                                                findings[top].tasks[currTask].structures[match1[2]] = {
                                                    structMembers : structBody
                                                };
                                            } else  {
                                                if (!findings[top].tasks[currTask].members) {
                                                    findings[top].tasks[currTask].members = {};
                                                }
                                                var varNames = match1[2].split(",");
                                                var eachVarName;
                                                for (eachVarName in varNames) {
                                                    var currVarName = varNames[eachVarName];
                                                    findings[top].tasks[currTask].members[currVarName] = {
                                                        type : "structure",
                                                        structMembers : structBody
                                                    };
                                                }
                                            }
                                        }
                                    } else {
                                        if (match[2]) {
                                            if (!findings[top].structures) {
                                                findings[top].structures = {};
                                            }
                                            findings[top].structures[match1[2]] = {
                                                structMembers : structBody
                                            };
                                        } else  {
                                            if (!findings[top].members) {
                                                findings[top].members = {};
                                            }
                                            var varNames = match1[2].split(",");
                                            var eachVarName;
                                            for (eachVarName in varNames) {
                                                var currVarName = varNames[eachVarName];
                                                findings[top].members[currVarName] = {
                                                    type : "structure",
                                                    structMembers : structBody
                                                };
                                            }
                                        }
                                    }
                                }
                            } else {
                                continue;
                            }
                        }

                        if (argsClosing.exec(currLineText) !== null) {
                            if (arggumentsFor === "functions") {
                                if (includeArgs) {
                                    if (classStarted) {
                                        findings[currClass].functions[functionName].args = argguments;
                                        findings[currClass].functions[functionName].parsedArgs = solveArgs(argguments);
                                        findings[currClass].functions[functionName].decLine.lineNum = currLine.lineNum;
                                        if (!findings[currClass].functions[functionName].extern) {
                                            findings[currClass].functions[functionName].startLine.lineNum = currLine.lineNum;
                                        }
                                    } else if (moduleStarted) {
                                        findings[currModule].functions[functionName].args = argguments;
                                        findings[currModule].functions[functionName].parsedArgs = solveArgs(argguments);
                                        findings[currModule].functions[functionName].decLine.lineNum = currLine.lineNum;
                                        if (!findings[currModule].functions[functionName].extern) {
                                            findings[currModule].functions[functionName].startLine.lineNum = currLine.lineNum;
                                        }
                                    }
                                }
                            } else if (arggumentsFor === "tasks") {
                                if (includeArgs) {
                                    if (classStarted) {
                                        findings[currClass].tasks[taskName].args = argguments;
                                        findings[currClass].tasks[taskName].parsedArgs = solveArgs(argguments);
                                        findings[currClass].tasks[taskName].decLine.lineNum = currLine.lineNum;
                                        if (!findings[currClass].tasks[taskName].extern) {
                                            findings[currClass].tasks[taskName].startLine.lineNum = currLine.lineNum;
                                        }
                                    } else if (moduleStarted) {
                                        findings[currModule].tasks[taskName].args = argguments;
                                        findings[currModule].tasks[taskName].parsedArgs = solveArgs(argguments);
                                        findings[currModule].tasks[taskName].decLine.lineNum = currLine.lineNum;
                                        if (!findings[currModule].tasks[taskName].extern) {
                                            findings[currModule].tasks[taskName].startLine.lineNum = currLine.lineNum;
                                        }
                                    }
                                }
                            } else if (arggumentsFor === "classDec") {
                                match = startings.class.exec(argguments);
                                findings[currClass].decLine.lineNum = currLine.lineNum;
                                findings[currClass].startLine.lineNum = currLine.lineNum;
                                if (match[7]) {
                                    findings[currClass].isParametrizedCLass = match[7];
                                }
                                if ((match = extendsRegex.exec(argguments)) !== null) {
                                    findings[currClass]["extends"] = match[4];
                                    if (match[3]) {
                                        findings[currClass].parametrizedBaseClass = true;
                                    }
                                }
                            } else if (arggumentsFor === "moduleDec") {
                                match = startings.module.exec(argguments);
                                findings[currModule].decLine.lineNum = currLine.lineNum;
                                findings[currModule].startLine.lineNum = currLine.lineNum;
                                if (match[7]) {
                                    findings[currModule].isParametrizedModule = match[7];
                                }
                                if (match[8]) {
                                    findings[currModule].args = match[8];
                                }
                            }
                            includeArgs = false;
                            argumentComplete = true;
                        }
                        continue;
                    }
                    if (((match = endings.class.exec(currLineText)) !== null) && (classStarted)) {
                        if ((functionStarted)||(taskStarted)) {
                            if (functionStarted) {
                                functionStarted = false;
                                findings[currClass].functions[currFunction].notEnded = true;
                                currFunction = "";
                            }
                            if (taskStarted) {
                                taskStarted = false;
                                findings[currClass].tasks[currTask].notEnded = true;
                                currTask = "";
                            }
                        }
                        findings[currClass]["endLine"] = currLine;
                        findings[currClass]["endTag"] = match[6];
                        findings[currClass]["notEnded"] = false;
                        classStarted = false;
                        currClass = "NoClass";

                    }
                    if (((match = endings.module.exec(currLineText)) !== null) && (moduleStarted)) {
                        if ((functionStarted)||(taskStarted)) {
                            if (functionStarted) {
                                functionStarted = false;
                                findings[currClass].functions[currFunction].notEnded = true;
                                currFunction = "";
                            }
                            if (taskStarted) {
                                taskStarted = false;
                                findings[currClass].tasks[currTask].notEnded = true;
                                currTask = "";
                            }
                        }
                        findings[currModule]["endLine"] = currLine;
                        findings[currModule]["endTag"] = match[6];
                        findings[currModule]["notEnded"] = false;
                        moduleStarted = false;
                        currModule = "NoModule";

                    }

                    if (classStarted) {
                        findings[currClass].body.push(currLine);

                        if (functionStarted) {
                            if (findings[currClass].functions[currFunction].body) {
                                findings[currClass].functions[currFunction].body.push(currLine);
                            }
                        }
                        if (taskStarted) {
                            if (findings[currClass].tasks[currTask].body) {
                                findings[currClass].tasks[currTask].body.push(currLine);
                            }
                        }   
                        if (!functionStarted && !taskStarted && startings.function.exec(currLineText) === null && startings.task.exec(currLineText) === null) {
                            if (classHandle.exec(currLineText) !== null) {
                                match = classHandle.exec(currLineText);
                                var temp = dataTypes.indexOf(match[6]);
                                if (temp === -1) {
                                    var classNameOfhandle = match[6];
                                    var handles = match[8];
                                    var handleSolver = /(\w+)\s*(\[([^\]]*?)\])?/;
                                    handles = handles.split(",");
                                    var singleHandle;
                                    for (singleHandle in handles) {
                                        match = handleSolver.exec(handles[singleHandle]);
                                        findings[currClass].handles[match[1]] = {
                                            type : classNameOfhandle,
                                            line : currLine,
                                            array : match[3]
                                        };
                                    }
                                }
                            }
                            if (utilsRegex.exec(currLineText) !== null) {
                                match = utilsRegex.exec(currLineText);
                                findings[currClass].factoryRegistration = {
                                    line : currLine,
                                    macroUsed : match[1],
                                    namePassed : match[5],
                                    paramPassed : []
                                };
                                if (match[6]) {
                                    if (match[7]) {
                                        match[7].split(",").forEach(function(obj,pos) {
                                            findings[currClass].factoryRegistration.paramPassed.push(obj.replace(/\s/g,""));
                                        });
                                    }
                                }
                            }
                            if (/`uvm_.+/.exec(currLineText) !== null) {
                                var match = /(`uvm_[^\s\(]+)/.exec(currLineText);
                                findings[currClass].uvm_macro[match[1]] = {
                                    "line" : currLine
                                };
                            }
                            findings[currClass].statements.push(currLine);
                        }
                        if (factoryCreation.exec(currLineText) !== null) {
                            match = factoryCreation.exec(currLineText);
                            findings[currClass].factoryCreation[match[1]] = {
                                "arrayed" : (match[2])?true:false,
                                "arrIndex" : match[3],
                                "className" : match[4],
                                "parametrized" : (match[5])?true:false,
                                "paramPasses" : (match[6])?(match[6].split(",")):undefined,
                                "namePassed" : match[7],
                                "parentPassed" : match[9],
                                "scope" : "",
                                "line" : currLine
                            };
                            if (/Some_Quoted_Text_/.exec(findings[currClass].factoryCreation[match[1]].namePassed) !== null) {
                                findings[currClass].factoryCreation[match[1]].namePassed = currLine.quoteStrings[findings[currClass].factoryCreation[match[1]].namePassed];
                                findings[currClass].factoryCreation[match[1]].namePassedType = "string";
                            } else if (/\$sformetf/.exec(findings[currClass].factoryCreation[match[1]].namePassed) !== null) {
                                findings[currClass].factoryCreation[match[1]].namePassedType = "formetedString";
                            } else {
                                findings[currClass].factoryCreation[match[1]].namePassedType = "variable";
                            }
                            if (functionStarted) {
                                findings[currClass].factoryCreation[match[1]].scope = currFunction;
                            } else if (taskStarted) {
                                findings[currClass].factoryCreation[match[1]].scope = currTask;
                            } else {
                                findings[currClass].factoryCreation[match[1]].scope = "class";
                            }
                        }
                        if (portConnect.exec(currLineText) !== null) {
                            match = portConnect.exec(currLineText);
                            //                        if (match[1]) {
                            //                            var scope = match[1].match(/[^\.]+\./g);
                            //                            var scope2 = [];
                            //                            scope.forEach(function (obj, num) {
                            //                                scope2.push(obj.match(/(\w+)\s*(\[[^\.]+\])/));
                            //                            });
                            //                        }
                            findings[currClass].portConnection.push({
                                "portOutside" : {
                                    "name" : match[3],
                                    "arrayed" : match[4],
                                    "scope" : resolvePortScope(match[1])
                                },
                                "scope" : (functionStarted)? currFunction : ((taskStarted)? currTask : "class"),
                                "portInside" : {
                                    "name" : match[8],
                                    "arrayed" : match[9],
                                    "scope" : resolvePortScope(match[6])
                                },
                                "line" : currLine
                            });
                        }
                    }
                    if (moduleStarted) {
                        findings[currModule].body.push(currLine);
                        if (functionStarted) {
                            if (findings[currModule].functions[currFunction].body) {
                                findings[currModule].functions[currFunction].body.push(currLine);
                            }
                        }
                        if (taskStarted) {
                            if (findings[currModule].tasks[currTask].body) {
                                findings[currModule].tasks[currTask].body.push(currLine);
                            }
                        }
                    }

                    if (!moduleStarted && !classStarted) {
                        if (functionStarted) {
                            if (parentOfExtern && findings[parentOfExtern].functions[currFunction]) {
                                if (findings[parentOfExtern].functions[currFunction].body) {
                                    findings[parentOfExtern].functions[currFunction].body.push(currLine);
                                }
                            }
                            if (factoryCreation.exec(currLineText) !== null) {
                                match = factoryCreation.exec(currLineText);
                                findings[parentOfExtern].factoryCreation[match[1]] = {
                                    "arrayed" : (match[2])?true:false,
                                    "arrIndex" : match[3],
                                    "className" : match[4],
                                    "parametrized" : (match[5])?true:false,
                                    "paramPasses" : (match[6])?(match[6].split(",")):undefined,
                                    "namePassed" : match[7],
                                    "parentPassed" : match[9],
                                    "scope" : "",
                                    "line" : currLine
                                };
                                if (/Some_Quoted_Text_/.exec(findings[parentOfExtern].factoryCreation[match[1]].namePassed) !== null) {
                                    findings[parentOfExtern].factoryCreation[match[1]].namePassed = currLine.quoteStrings[findings[parentOfExtern].factoryCreation[match[1]].namePassed];
                                    findings[parentOfExtern].factoryCreation[match[1]].namePassedType = "string";
                                } else if (/\$sformetf/.exec(findings[parentOfExtern].factoryCreation[match[1]].namePassed) !== null) {
                                    findings[parentOfExtern].factoryCreation[match[1]].namePassedType = "formetedString";
                                } else {
                                    findings[parentOfExtern].factoryCreation[match[1]].namePassedType = "variable";
                                }
                                findings[parentOfExtern].factoryCreation[match[1]].scope = currFunction;
                            }
                        }
                        if (taskStarted) {
                            if (parentOfExtern && findings[parentOfExtern].tasks[currTask]) {
                                if (findings[parentOfExtern].tasks[currTask].body) {
                                    findings[parentOfExtern].tasks[currTask].body.push(currLine);
                                }
                            }
                            if (factoryCreation.exec(currLineText) !== null) {
                                match = factoryCreation.exec(currLineText);
                                findings[parentOfExtern].factoryCreation[match[1]] = {
                                    "arrayed" : (match[2])?true:false,
                                    "arrIndex" : match[3],
                                    "className" : match[4],
                                    "parametrized" : (match[5])?true:false,
                                    "paramPasses" : (match[6])?(match[6].split(",")):undefined,
                                    "namePassed" : match[7],
                                    "parentPassed" : match[9],
                                    "scope" : "",
                                    "line" : currLine
                                };
                                if (/Some_Quoted_Text_/.exec(findings[parentOfExtern].factoryCreation[match[1]].namePassed) !== null) {
                                    findings[parentOfExtern].factoryCreation[match[1]].namePassed = currLine.quoteStrings[findings[parentOfExtern].factoryCreation[match[1]].namePassed];
                                    findings[parentOfExtern].factoryCreation[match[1]].namePassedType = "string";
                                } else if (/\$sformetf/.exec(findings[parentOfExtern].factoryCreation[match[1]].namePassed) !== null) {
                                    findings[parentOfExtern].factoryCreation[match[1]].namePassedType = "formetedString";
                                } else {
                                    findings[parentOfExtern].factoryCreation[match[1]].namePassedType = "variable";
                                }
                                findings[parentOfExtern].factoryCreation[match[1]].scope = currTask;
                            }
                        }
                    }

                    if ((match = struct_union_Regex.exec(currLineText)) !== null) {
                        var structBody = match[7];
                        var startBracesCount = countCharInLine("{", structBody);
                        var endBracesCount   = countCharInLine("}", structBody);
                        if (startBracesCount !== endBracesCount) {
                            argguments = currLineText;
                            arggumentsFor = "structDec";
                            argumentComplete = false;
                            includeArgs = false;
                        }
                        continue;
                    }
                    //searching for funtions
                    if ((match = startings.function.exec(currLineText)) !== null) {
                        if ((functionStarted)||(taskStarted)) {
                            if (functionStarted) {
                                functionStarted = false;
                                findings[currClass].functions[currFunction].notEnded = true;
                                currFunction = "";
                            }
                            if (taskStarted) {
                                taskStarted = false;
                                findings[currClass].tasks[currTask].notEnded = true;
                                currTask = "";
                            }
                        }
                        var functionName = match[19],
                            extern = false;
                        currFunction = functionName;
                        if (externRegex.exec(match[2]) === null) {
                            functionStarted = true;
                            extern = false;
                        } else {
                            extern = true;
                        }

                        if (classStarted) {
                            if (findings[currClass].functions) {
                                findings[currClass].functions[functionName] = {
                                    "name" : functionName,
                                    "decLine" : currLine,
                                    "body" : [],
                                    "extern" : extern
                                };
                                if (!extern) {
                                    findings[currClass].functions[functionName].startLine = currLine;
                                }
                                if (argsClosing.exec(currLineText) === null) {
                                    argguments = match[20];
                                    arggumentsFor = "functions";
                                    argumentComplete = false;
                                    includeArgs = true;
                                } else {
                                    var currLineForArgs = match[20];
                                    if (currLine.quoteStrings) {
                                        var quoteStringsID;
                                        for (quoteStringsID in currLine.quoteStrings) {
                                            currLineForArgs = currLineForArgs.replace(new RegExp(quoteStringsID,"g"), "\"" + currLine.quoteStrings[quoteStringsID] + "\"");
                                        }
                                    }
                                    findings[currClass].functions[functionName].args = currLineForArgs + ");";
                                    findings[currClass].functions[functionName].parsedArgs = solveArgs(findings[currClass].functions[functionName].args);
                                }
                            }
                        }
                        else if (moduleStarted) {
                            if (findings[currModule].functions) {
                                findings[currModule].functions[functionName] = {
                                    "name" : functionName,
                                    "decLine" : currLine,
                                    "startLine" : currLine,
                                    "body" : [],
                                    "extern" : extern
                                };
                                if (!extern) {
                                    findings[currModule].functions[functionName].startLine = currLine;
                                }
                                if (argsClosing.exec(currLineText) === null) {
                                    argguments = match[20];
                                    arggumentsFor = "functions";
                                    argumentComplete = false;
                                    includeArgs = true;
                                } else {
                                    findings[currModule].functions[functionName].args = match[20] + ");";
                                }
                            }
                        } else {
                            if (externNameSolver.exec(functionName) !== null) {
                                var match1 = externNameSolver.exec(functionName);
                                parentOfExtern = match1[1];
                                functionName = match1[2];
                                currFunction = functionName;
                                if (argsClosing.exec(currLineText) === null) {
                                    argguments = match[20];
                                    arggumentsFor = "functions";
                                    argumentComplete = false;
                                    includeArgs = false;
                                }
                                findings[parentOfExtern].functions[functionName].startLine = currLine; 
                            }
                        }
                    }

                    //  Searching for task
                    if ((match = startings.task.exec(currLineText)) !== null) {
                        if ((functionStarted)||(taskStarted)) {
                            if (functionStarted) {
                                functionStarted = false;
                                findings[currClass].functions[currFunction].notEnded = true;
                                currFunction = "";
                            }
                            if (taskStarted) {
                                taskStarted = false;
                                findings[currClass].tasks[currTask].notEnded = true;
                                currTask = "";
                            }
                        }
                        var taskName = match[17],
                            extern = false;
                        currTask = taskName;
                        if (externRegex.exec(match[2]) === null) {
                            taskStarted = true;
                            extern = false;
                        } else {
                            extern = true;
                        }

                        if (classStarted) {
                            if (findings[currClass].tasks) {
                                findings[currClass].tasks[taskName] = {
                                    "name" : taskName,
                                    "decLine" : currLine,
                                    "body" : [],
                                    "extern" : extern
                                };
                                if (!extern) {
                                    findings[currClass].tasks[taskName].startLine = currLine;
                                }
                                if (argsClosing.exec(currLineText) === null) {
                                    argguments = match[18];
                                    arggumentsFor = "tasks";
                                    argumentComplete = false;
                                    includeArgs = true;
                                } else {
                                    findings[currClass].tasks[taskName].args = match[18] + ");";
                                    findings[currClass].tasks[taskName].parsedArgs = solveArgs(findings[currClass].tasks[taskName].args);
                                }
                            }
                        }
                        else if (moduleStarted) {
                            if (findings[currModule].tasks) {
                                findings[currModule].tasks[taskName] = {
                                    "name" : taskName,
                                    "decLine" : currLine,
                                    "startLine" : currLine,
                                    "body" : [],
                                    "extern" : extern
                                };
                                if (!extern) {
                                    findings[currModule].tasks[taskName].startLine = currLine;
                                }
                                if (argsClosing.exec(currLineText) === null) {
                                    argguments = match[18];
                                    arggumentsFor = "tasks";
                                    argumentComplete = false;
                                    includeArgs = true;
                                } else {
                                    findings[currModule].tasks[taskName].args = match[18] + ");";
                                }
                            }
                        } else {
                            if (externNameSolver.exec(taskName) !== null) {
                                var match1 = externNameSolver.exec(taskName);
                                parentOfExtern = match1[1];
                                taskName = match1[2];
                                currTask = taskName;
                                if (argsClosing.exec(currLineText) === null) {
                                    argguments = match[20];
                                    arggumentsFor = "tasks";
                                    argumentComplete = false;
                                    includeArgs = false;
                                }
                                findings[parentOfExtern].tasks[taskName].startLine = currLine; 
                            }
                        }
                    }



                    if (functionStarted) {
                        if ((match = endings.function.exec(currLineText)) !== null) {
                            if (classStarted) {
                                if (findings[currClass].functions[currFunction]) {
                                    findings[currClass].functions[currFunction].endLine = currLine;
                                    findings[currClass].functions[currFunction].endTag = match[5];
                                }
                            } else if (moduleStarted) {
                                if (findings[currModule].functions[currFunction]) {
                                    findings[currModule].functions[currFunction].endLine = currLine;
                                    findings[currModule].functions[currFunction].endTag = match[5];
                                }
                            } else {
                                if (parentOfExtern !== "") {
                                    findings[parentOfExtern].functions[currFunction].endLine = currLine;
                                    findings[parentOfExtern].functions[currFunction].endTag = match[5];
                                }
                            }
                            functionStarted = false;
                        }
                    }

                    if (taskStarted) {
                        if ((match = endings.task.exec(currLineText)) !== null) {
                            if (classStarted) {
                                if (findings[currClass].tasks[currTask]) {
                                    findings[currClass].tasks[currTask].endLine = currLine;
                                    findings[currClass].tasks[currTask].endTag = match[5];
                                }
                            } else if (moduleStarted) {
                                if (findings[currModule].tasks[currTask]) {
                                    findings[currModule].tasks[currTask].endLine = currLine;
                                    findings[currModule].tasks[currTask].endTag = match[5];
                                }
                            } else {
                                if (parentOfExtern !== "") {
                                    findings[parentOfExtern].tasks[currTask].endLine = currLine;
                                    findings[parentOfExtern].tasks[currTask].endTag = match[5];
                                }
                            }
                            taskStarted = false;
                        }
                    }

                    if (((match = startings.class.exec(currLineText)) !== null)&&(!moduleStarted)&&(typeDefClass.exec(currLineText) === null)) {
                        if (classStarted) {
                            classStarted = false;
                            findings[currClass].notEnded = true;
                            currClass = "";
                        }
                        currClass = match[6];
                        findings[currClass] = {
                            "decLine" : currLine,
                            "startLine" : currLine,
                            "body" : [],
                            "name" : currClass,
                            "type" : "class",
                            "functions" : {},
                            "tasks" : {},
                            "statements" : [],
                            "handles" : {},
                            "notEnded" : true,
                            "factoryCreation" : {},
                            "portConnection" : [],
                            "uvm_macro" : {}
                        };
                        findings.length = findings.length + 1;
                        if (argsClosing.exec(currLineText) === null) {
                            argguments = currLineText;
                            arggumentsFor = "classDec";
                            argumentComplete = false;
                            includeArgs = false;
                        } else {
                            if (match[7]) {
                                findings[currClass].isParametrizedCLass = match[8];
                                var allParams = match[8].split(",");
                                findings[currClass].parameters = [];
                                allParams.forEach(function (obj, num) {
                                    var localMatch = paramDecodeRegex.exec(obj);
                                    findings[currClass].parameters.push(localMatch[1]);
                                });
                                //                            findings[currClass].parameters = paramDecodeRegex.exec(match[8]);
                            }
                            if ((match = extendsRegex.exec(currLineText)) !== null) {
                                findings[currClass]["extends"] = match[4];
                                if (match[3]) {
                                    findings[currClass].parametrizedBaseClass = true;
                                }
                            }
                        }
                        classStarted = true;
                    }
                    if (((match = startings.module.exec(currLineText)) !== null)&&(!classStarted)) {
                        currModule = match[6];
                        findings[currModule] = {
                            "decLine" : currLine,
                            "startLine" : currLine,
                            "body" : [],
                            "name" : currModule,
                            "type" : "module",
                            "functions" : {},
                            "tasks" : {},
                            "notEnded" : true
                        };
                        findings.length = findings.length + 1;
                        moduleStarted = true;
                        if (argsClosing.exec(currLineText) === null) {
                            argguments = currLineText;
                            arggumentsFor = "moduleDec";
                            argumentComplete = false;
                            includeArgs = false;
                        }
                        if (match[8]) {
                            findings[currModule].args = match[8];
                        }
                    }

                }catch(EX){
                    if(isDebug)console.log("Err (parseSVfile2) "+EX.message )   ;
                }

            }
        }

        var endTime = new Date();
        logger.log("[ParseSV " + new Date().getHours() + ":" + new Date().getMinutes() + ":" + new Date().getSeconds() + 
                   ":" + new Date().getMilliseconds() + "] Parsing ended.");
        logger.log("[ParseSV] Time spent on parsing => " + Math.abs(endTime - startTime));
        logger.log("[ParseSV " + new Date().getHours() + ":" + new Date().getMinutes() + ":" + new Date().getSeconds() + 
                   ":" + new Date().getMilliseconds() + "] adding baseclasses.");
        for (i in findings) {
            try{
                if ((findings[i].type === "class") && (findings[i].extends)) {
                    var currClassBase = findings[i].extends;
                    findings[i].baseClasses = {};
                    var baseClasses = {};
                    // getting all hierarchy
                    while (currClassBase && !ignoreBaseClass) {
                        var baseClass = DViHelper.ifClassAvailableInCache(currClassBase);
                        if (baseClass) {
                            var filePath = baseClass.file;
                            baseClass = parseSVfile(null, filePath, true)[currClassBase];
                            baseClass.file = filePath;
                            baseClasses[currClassBase] = baseClass;
                            if (currClassBase === "uvm_component") {
                                findings[i].baseClasses = baseClasses;
                                findings[i].ObjectOrComponent = "component";
                                break;
                            }
                            if (currClassBase === "uvm_object") {
                                findings[i].baseClasses = baseClasses;
                                findings[i].ObjectOrComponent = "object";
                                break;
                            }
                            if (currClassBase === "uvm_agent") {
                                findings[i].AgentOrDriver = "agent";
                            }
                            if (currClassBase === "uvm_driver") {
                                findings[i].AgentOrDriver = "driver";
                            }
                            if (currClassBase === "uvm_sequence") {
                                findings[i].AgentOrDriver = "sequence";
                            }
                            if (currClassBase === "uvm_scoreboard") {
                                findings[i].AgentOrDriver = "scoreboard";
                            }
                            if (currClassBase === "uvm_reg_adapter") {
                                findings[i].AgentOrDriver = "adapters";
                            }
                            if (currClassBase === "uvm_sequencer") {
                                findings[i].AgentOrDriver = "sequencer";
                            }
                            if (!baseClass.extends) {
                                findings[i].baseClasses = baseClasses;
                            }
                            currClassBase = baseClass.extends;
                        } else {
                            currClassBase = undefined;
                        }
                    }
                    // getting classes of all handles
                    var singleHandle;
                    for (singleHandle in findings[i].handles) {
                        var handleClass = DViHelper.ifClassAvailableInCache(findings[i].handles[singleHandle].type);
                        if (handleClass) {
                            findings[i].handles[singleHandle].handleClass = handleClass;
                        }
                    }
                }
            }catch(EX){
                if(isDebug)console.log("Err (parseSVfile3) "+EX.message )   ;
            }
        }
        logger.log("[ParseSV " + new Date().getHours() + ":" + new Date().getMinutes() + ":" + new Date().getSeconds() + 
                   ":" + new Date().getMilliseconds() + "] Baseclasses added.");
        logger.log("[ParseSV] Time spent on adding Baseclasses => " + Math.abs(new Date() - endTime));
        return findings;
    }

    function solveArgs (text) {
        text = /\s*\(([^\)]+)\)/.exec(text);
        if (text && text[1]) {
            text = text[1];
        } else {
            return null;
        }
        var allArgsText = text.split(",");
        var argsOut = {};
        allArgsText.forEach(function (obj, num) {
            if (/(\w+)\s+(\w+)\s*(=\s*\w+\s*)?$/.exec(obj) !== null) {
                var match = /(\w+)\s+(\w+)\s*(=\s*\w+\s*)?$/.exec(obj);
                argsOut[match[2]] = {
                    type : match[1],
                    defaultVal : match[4]
                }
            }
        });
        return argsOut;
    }

    function getMethodNameAndScope (text) {
        var parent = [];
        var i;
        var temp = "";
        for (i = text.length-1; i > 0; i--) {
            var currChar = text[i];
            if (currChar !== ".") {
                temp = temp + currChar;
            } else {
                parent.push(temp);
                temp = "";
            }
        }
        //        var token = session.getToken(pos);
        //        if (token.type !== null) {
        //            parent.push(token.string);
        //            var new_pos = {ch : token.start, line : pos.line};
        //            var new_token = session.getToken(new_pos);
        //            while (new_token.string === ".") {
        //                new_pos.ch = new_token.start - 1;
        //                new_token = session.getToken(new_pos, true);
        //                parent.push(new_token.string);
        //                new_pos.ch = new_token.start;
        //                new_token = session.getToken(new_pos, true);
        //            }
        //        }
        return parent;
    }

    function countCharInLine (char, text) {
        var i;
        var count = 0;
        for (i in text) {
            if (i < text.length) {
                if (text[i] === char) {
                    count += 1;
                }
            }
        }
        return count;
    }

    function resolvePortScope (line) {
        var toReturn = []; 
        if (line) {
            var scope = line.match(/[^\.]+\./g);
            scope.forEach(function (obj, num) {
                var temp = obj.match(/(\w+)\s*(\[[^\.]+\])?/);
                toReturn.push({
                    "name" : temp[1],
                    "arrayed" : temp[2]
                });
            });
        }

        //        if (toReturn.length > 0) {
        return toReturn;
        //        } else {
        //            return null;
        //        }
    }
    function fillQuotedTextBack (match, quotedtexts) {
        match.forEach(function (obj, num) {
            if (quotedtexts[obj]) {
                match[num] = quotedtexts[obj];
            }
        });
        return match;
    }

    exports.parseSVfile     = parseSVfile;
    exports.removeComments  = removeComments;

});
