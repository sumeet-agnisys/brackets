//DViHelper : For Parsing Code and other help.



define(function (require, exports, module) {
    "use strict";

    var isDebug=false;
    //    var _ = require("thirdparty/lodash");

    var DocumentManager         = require('document/DocumentManager'),
        ProjectManager          = require('project/ProjectManager'),
        fileUtils               = require('file/FileUtils'),
        FileSystem              = require("filesystem/FileSystem"),
        ParseSVfile             = require("language/ParseSVfile"),
        ParserUtils      	    = brackets.getModule("parserutils/ParserUtils")
    ;


    var version ="2.2",
        previous_version ="2.1";
    // var previous_version = version;
    var keywords = ["accept_on","alias","always","always_comb","always_ff","always_latch","and","assert","assign","assume","automatic","before","begin","bind","bins","binsof","bit","break","buf","bufif0","bufif1","byte","case","casex","casez","cell","chandle","checker","class","clocking","cmos","config","const","constraint","context","continue","cover","covergroup","coverpoint","cross","deassign","default","defparam","design","disable","dist","do","edge","else","end","endcase","endchecker","endclass","endclocking","endconfig","endfunction","endgenerate","endgroup","endinterface","endmodule","endpackage","endprimitive","endprogram","endproperty","endspecify","endsequence","endtable","endtask","enum","event","eventually","expect","export","extends","extern","final","first_match","for","force","foreach","forever","fork","forkjoin","function","generate","genvar","global","highz0","highz1","if","iff","ifnone","ignore_bins","illegal_bins","implements","implies","import","incdir","include","initial","inout","input","inside","instance","int","integer","interconnect","interface","intersect","join","join_any","join_none","large","let","liblist","library","local","localparam","logic","longint","macromodule","matches","medium","modport","module","nand","negedge","nettype","new","nexttime","nmos","nor","noshowcancelled","not","notif0","notif1","null","or","output","package","packed","parameter","pmos","posedge","primitive","priority","program","property","protected","pull0","pull1","pulldown","pullup","pulsestyle_ondetect","pulsestyle_onevent","pure","rand","randc","randcase","randsequence","rcmos","real","realtime","ref","reg","reject_on","release","repeat","restrict","return","rnmos","rpmos","rtran","rtranif0","rtranif1","s_always","s_eventually","s_nexttime","s_until","s_until_with","scalared","sequence","shortint","shortreal","showcancelled","signed","small","soft","solve","specify","specparam","static","string","strong","strong0","strong1","struct","super","supply0","supply1","sync_accept_on","sync_reject_on","table","tagged","task","this","throughout","time","timeprecision","timeunit","tran","tranif0","tranif1","tri","tri0","tri1","triand","trior","trireg","type","typedef","union","unique","unique0","unsigned","until","until_with","untyped","use","uwire","var","vectored","virtual","void","wait","wait_order","wand","weak","weak0","weak1","while","wildcard","wire","with","within","wor","xnor","xor"],
        dataTypes = ["bit", "buf", "bufif0", "bufif1", "byte", "const", "enum", "event", "genvar", "highz0", "highz1", "inout", "input", "int", "integer", "longint", "parameter", "protected", "pull0", "pull1", "pulldown", "pullup", "pure", "rand", "randc", "real", "realtime", "reg", "rnmos", "rpmos", "rtran", "rtranif0", "rtranif1", "shortint", "shortreal", "signed", "static", "string", "strong", "strong0", "strong1", "supply0", "supply1", "time", "tranif0", "tranif1", "tri", "tri0", "tri1", "triand", "trior", "trireg", "var", "weak", "weak0", "weak1"];


    function getCurrClassHints(doc, query) {
        isDebug=ParserUtils._isDebugOn();
        var from = 0,
            to = doc.size - 1,
            out = [],
            classRegexp   = /((^class)|(\s+class))\s+((static|automatic)\s+)?\s*(\w+)\s*(#\([\s\w=:,\[\]]+\))?/,
            currClass;
        $.ajaxSetup({async: false});
        doc.iter(from, to, function (line) { out.push(line.text); });
        $.ajaxSetup({async: true});
        out = ParseSVfile.removeComments(out);
        var i;
        var line = "";
        to = out.length;
        for (i = 0; i < out.length; i++) {
            line = line + out[i].text + " ";
        }
        var finalCharList = [];
        var done = [];
        var chars = line.match(/[\w_\$]+/g);
        for (i in chars) {
            if((keywords.indexOf(chars[i]) === -1) && (done.indexOf(chars[i]) === -1) && (chars[i] !== query)) {
                done.push(chars[i]);
                finalCharList.push({
                    depth : 0,
                    gusses : undefined,
                    origin: "file Scope",
                    value: chars[i]
                });
            }
        }
        return finalCharList;
    }


    function getBaseClass(doc, pos) {
        isDebug=ParserUtils._isDebugOn();
        if(isDebug)console.log("getBaseClass calling...");
        var from = 0,
            to = pos.line + 1,
            out = [],
            classRegexp   = /((^class)|(\s+class))\s+((static|automatic)\s+)?\s*(\w+)\s*(#\([\s\w=:,\[\]]+\))?/,
            extendsRegexp = /class\s+\w+\s+(#[(),\s\w=:\[\]]+[^\s+])?\s*extends\s+((#[(),\s\w=:\[\]]+[^\s+])\s+)?(\w+)/,
            BaseClass;

        $.ajaxSetup({async: false});
        doc.iter(from, to, function (line) { out.push(line.text); });
        $.ajaxSetup({async: true});
        out = ParseSVfile.removeComments(out);
        to = out.length;
        var i;
        var match;
        for(i = (to - 1); i >= from; --i) {
            var currLine = out[i].text;
            if (classRegexp.exec(currLine) !== null) {
                if ((match = extendsRegexp.exec(currLine)) !== null) {
                    BaseClass = match[4];
                    return ifClassAvailableInCache(BaseClass);
                }
            }
        }
        return undefined;
    }


    function getCurrClass(doc, pos, path) {
        isDebug=ParserUtils._isDebugOn();
        //isDebug=false;
        if(isDebug)console.log("---getCurrentClass calling...");
        var from = 0,
            to = pos.line + 1,
            out = [],
            //classRegexp   = /((^class)|(\s+class))\s+((static|automatic)\s+)?\s*(\w+)\s*(#\([\s\w=:,\[\]]+\))?/,
            classRegexp   = /((^(class|addrmap))|(\s+(class|addrmap)))\s+((static|automatic)\s+)?\s*(\w+)\s*(#\([\s\w=:,\[\]]+\))?/,//to support rdl
            currClass;

        $.ajaxSetup({async: false});
        doc.iter(from, to, function (line) { out.push(line.text); });
        $.ajaxSetup({async: true});
        out = ParseSVfile.removeComments(out);
        var i;
        var match;
        to = out.length;
        if(isDebug)console.log("---ParseSVFile.removeComment length : "+to);
        for(i = (to - 1); i >= from; --i) {
            var currLine = out[i].text;
            if(isDebug)console.log("---DViHelper currLine "+currLine);
            if (classRegexp.exec(currLine) !== null) {
                if ((match = classRegexp.exec(currLine)) !== null) {
                    if(isDebug){
                        for(var i=0;i<match.length;i++){
                            console.log("--match["+i+"]"+match[i])   ;
                        }
                    }
                    //currClass = match[6];
                    currClass=match[8]; //to support systemrdl
                    return ifClassAvailableInCache(currClass, path);
                }
            }
            else{
                if(isDebug)console.log("Err classRegexp not matched");  
            }
        }
        if(isDebug)console.log("---return default undefined in getCurrClass");
        return undefined;
    }



    function getHandleFromObject(doc, handle, pos) {
        isDebug=ParserUtils._isDebugOn();
        var to = doc.size - 1,
            from = 0,
            out = [];
        //        var myRegexpForClass = new RegExp("^(\\s*)(virtual\\s+)?(\\w+)\\s+(#\\(\\s*\\w+\\s*(,\\s*\\w+\\s*)?\\s*\\)\\s+)?((\\w+\\s*,\\s*)+)?" +  handle + "((\\s*,\\s*\\w+\\s*)+)?\\s*"),
        var classHandle = /^\s*((?!(virtual|typedef)?(class|function|task)))((\w+)\s+)+(\#\(.*?\)\s+)?(((\w+)\s*(\[([^\]]*?)\])?\s*)((,\s*(\w+)\s*(\[([^\]]*?)\])?\s*)+)?)(=new\(.*?\)|;)/,
            classStart = /((^class)|(\s+class))\s+((static|automatic)\s+)?\s*(\w+)\s*(#\(([\s\w=:,\[\]\"\"]+)\))?/,
            classEnd = /((^endclass)|(\s+endclass))((\s+)?\:\s*(\w+)?)?\s*;?\s*/;
        if (pos) {
            to = pos.line + 1;
        }

        $.ajaxSetup({async: false});
        doc.iter(from, to, function (line) { out.push(line.text); });
        $.ajaxSetup({async: true});

        var match;
        var ObjectName = undefined;
        var handlesList = {};
        for(i = (to - 1); i >= from; --i) {
            var currLine = out[i];
            //            if (classEnd.exec(currLine) !== null) {
            //                if (pos.line > i) {
            //                    handlesList = {};
            //                } 
            //            }
            if (classHandle.exec(currLine) !== null) {
                var match = classHandle.exec(currLine);
                var temp = dataTypes.indexOf(match[5]);
                if (temp === -1) {
                    var classNameOfhandle = match[5];
                    var match = match[7];
                    var handleSolver = /(\w+)\s*(\[([^\]]*?)\])?/;
                    match = match.split(",");
                    var singleHandle;
                    for (singleHandle in match) {
                        match = handleSolver.exec(match[singleHandle]);
                        handlesList[match[1]] = classNameOfhandle;
                    }
                }
            }
            if (handlesList[handle]) {
                return handlesList[handle];
            }
            if ((classStart.exec(currLine) !== null) && pos) {
                return undefined;
            }
            /*if ((match = myRegexpForClass.exec(currLine)) !== null) {
                ObjectName = match[3];
                var matchPos = { 
                    ch : currLine.indexOf(ObjectName) + 1,
                    line : i
                };
                var matchToken = doc.cm.getTokenAt(matchPos);
                if(matchToken.type !== "comment") {
                    var temp = keywords.indexOf(ObjectName);
                    if (temp === -1) {
                        return ObjectName;
                    } else {
                        return handle;
                    }
                }
            }*/
        }
        return undefined;
    }

    //return class object if avlaible in cache
    function ifClassAvailableInCacheOld(name, path) {
        isDebug=ParserUtils._isDebugOn();
        var block;
        var projectRoot = ProjectManager.getProjectRoot()._path;
        var cacheFile;
        if (path) {
            cacheFile = readCacheFile(path);
            if (cacheFile) {
                block = cacheFile[name];
                if (block) {
                    if (typeof block === 'string') {
                        cacheFile = readCacheFile(block);
                        if (cacheFile) {
                            block = cacheFile[name];
                            return block;
                        }
                        //                var temp = getDocFromPath(block.file);
                    } else {
                        return block;
                    }
                }
            }
        }
        cacheFile = readCacheFile(projectRoot);
        if (cacheFile) {
            block = cacheFile[name];
        } else {
            return undefined;
        }
        if (block) {
            if (typeof block === 'string') {
                cacheFile = readCacheFile(block);
                if (cacheFile) {
                    block = cacheFile[name];
                    return block;
                } else {
                    return undefined;
                }
                //                var temp = getDocFromPath(block.file);
            } else {
                return block;
            }
        } else {
            return undefined;
        }
    }

    function ifClassAvailableInCache(name, path) {
        isDebug=ParserUtils._isDebugOn();
        //isDebug=false;
        if(isDebug)console.log("ifClassAvailableInCache calling...");
        if(isDebug)console.log("---name : "+name);
        if(isDebug)console.log("---path : "+path);

        try{
            // if path is provided then name will only be searched in the cache file of that path.
            if (path) {
                if(isDebug)console.log("--path condition true");
                var cacheFile = readCacheFile(path);
                if (cacheFile) {
                    if(isDebug)console.log("--cacheFile found");
                    var block = cacheFile[name];
                    if(isDebug)console.log("--cacheFile[name] "+block);
                    if (block) {
                        if (typeof block === 'string') {
                            cacheFile = readCacheFile(block);
                            if (cacheFile) {
                                block = cacheFile[name];
                                return block;
                            }
                            //                var temp = getDocFromPath(block.file);
                        } else {
                            return block;
                        }
                    }
                } else {
                    if(isDebug)console.log("--cacheFile not found");
                    //console.log("--cacheFile not found");
                    return null;
                }
            }
            else {
                if(isDebug)console.log("--path is not provided, name will searched in project root .DVidata");
                // if path is not provided then name will first be searched in project root and then in the cache file of .DViData folder in project root.
                var projectRoot = ProjectManager.getProjectRoot()._path;
                var cacheFile = readCacheFile(projectRoot);
                if(isDebug)console.log("--cacheFile : "+cacheFile);
                if (cacheFile && cacheFile[name]) {
                    if(isDebug)console.log("--search in project root");
                    // search in project root
                    var block = cacheFile[name];
                    if (block) {
                        if (typeof block === 'string') {
                            cacheFile = readCacheFile(block);
                            if (cacheFile) {
                                block = cacheFile[name];
                                return block;
                            } else {
                                return undefined;
                            }
                            //                var temp = getDocFromPath(block.file);
                        } else {
                            return block;
                        }
                    }
                } else {
                    if(isDebug)console.log("--search in DVidata");
                    // search in DViData
                    var DViDataPath = projectRoot + ".dvidata/";
                    cacheFile = readCacheFile(null, DViDataPath + ".uvmCache"+version+".json");
                    if (cacheFile && cacheFile[name]) {
                        // search in project root
                        var block = cacheFile[name];
                        if (block) {
                            if (typeof block === 'string') {
                                cacheFile = readCacheFile(block);
                                if (cacheFile) {
                                    block = cacheFile[name];
                                    return block;
                                } else {
                                    return undefined;
                                }
                                //                var temp = getDocFromPath(block.file);
                            } else {
                                return block;
                            }
                        }
                    }
                }
            }
        }
        catch(EX){
            if(isDebug)   console.log("Err (ifClassAvailableInCache) "+EX.message);
        }
    }


    // get Cache file from path
    function readCacheFile(FileLoc, FullPath) {
        //isDebug=ParserUtils._isDebugOn();
        //isDebug=false;
        if(isDebug)console.log("readCacheFile calling...");
        if(isDebug)console.log("---FileLoc "+FileLoc);
        if(isDebug)console.log("---FullPath "+FullPath);
        try{
            var os = getOS();
            //console.log("getOS done");
            var cacheFilePath;
            if (FullPath) {
                cacheFilePath = FullPath;
            } else {
                // cacheFilePath = FileLoc + ".svcreator.cache.json";
                cacheFilePath = FileLoc + ".dvi.cache.json";
            }
            cacheFilePath = cacheFilePath.replace(/\\/g,"/");
            if(isDebug)console.log("---cacheFilePath "+cacheFilePath);
            //console.log("cache file path "+cacheFilePath);

            $.ajaxSetup({async: false});
            //        var fileData = $.get(cacheFilePath);
            var cacheFile = $.getJSON(cacheFilePath);
            if (cacheFile.readyState === 4 && cacheFile.statusText === "success") {
                cacheFile = cacheFile.responseText;
                cacheFile = JSON.parse(cacheFile);
                $.ajaxSetup({async: true});
                if(isDebug)console.log("---returned cacheFile "+cacheFile);
                return cacheFile;
            } else {
                //console.log("---json not found ");
                $.ajaxSetup({async: true});
                return undefined;
            } 
        }
        catch(EZ){
            if(isDebug)   console.log("Err (readCacheFile) "+EZ.message);
        }
    }


    // generate Doc from path
    function getDocFromPath(path) {
        isDebug=ParserUtils._isDebugOn();
        var docToReturn;

        $.ajaxSetup({async: false});
        return DocumentManager.getDocumentForPath(path)
        .done(
            function(doc) {
                docToReturn = doc;
                //                return docToReturn
            }
        );
        $.ajaxSetup({async: true});
        //        alert("2");
        return docToReturn;
    }



    // get working OS
    function getOS() {
        isDebug=ParserUtils._isDebugOn();
        if (navigator.platform === "Win32") {
            return "Windows";
        } else {
            return "nonWindows";
        }
    }


    function getMethodHintsFromCacheObj(cacheobj) {
        isDebug=ParserUtils._isDebugOn();
        var methods = cacheobj.methods;
        var members = cacheobj.members;
        if (typeof cacheobj === 'string') {
            return null;
        }

        var i,
            method = undefined,
            member = undefined,
            hints = [];

        for (i in methods) {
            method = {
                depth : 0,
                gusses : undefined,
                type : methods[i].type,
                origin: cacheobj.file,
                value: i
            };
            hints.push(method);
        }
        for (i in members) {
            member = {
                depth : 0,
                gusses : undefined,
                type : members[i].type,
                origin: cacheobj.file,
                value: i
            };
            hints.push(member);
        }

        if(hints.length !== 0) {
            return hints;
        } else {
            return null;
        }
    }

    function getMethodInfo(nameAndScope, pos, path) {
        isDebug=ParserUtils._isDebugOn();
        if(isDebug)console.log("getMethodInfo calling...");
        var basePath = fileUtils.getDirectoryPath(path);
        var ParsedFile = ParseSVfile.parseSVfile(null, path);
        var singleCacheObj;
        var currClassObj;
        var methodList;
        for (singleCacheObj in ParsedFile) {
            var currObj = ParsedFile[singleCacheObj];
            if (currObj.startLine.lineNum < pos.line && currObj.endLine.lineNum > pos.line) {
                var objectToInvestigate = currObj;
                if (nameAndScope.length > 1) {
                    if (nameAndScope[nameAndScope.length -1] === "super") {
                        var temp = nameAndScope.pop();
                        objectToInvestigate = ParseSVfile.parseSVfile(null,currObj.baseClasses[currObj.extends].file);
                        objectToInvestigate = objectToInvestigate[currObj.extends];
                    }
                    if (nameAndScope[nameAndScope.length -1] === "this") {
                        var temp = nameAndScope.pop();
                        objectToInvestigate = currObj;
                    }
                }
                if (nameAndScope.length > 1) {
                    while (nameAndScope.length > 1) {
                        var nextHandleName = nameAndScope.pop();
                        var handleClass;
                        if (objectToInvestigate.handles[nextHandleName]) {
                            if (objectToInvestigate.handles[nextHandleName].handleClass) {
                                handleClass = objectToInvestigate.handles[nextHandleName].handleClass;
                            } else {
                                handleClass = ifClassAvailableInCache(objectToInvestigate.handles[nextHandleName].type);
                                if (!handleClass) {
                                    return null;
                                }
                            }
                        } else {
                            return null;
                        }
                        var fileObj = ParseSVfile.parseSVfile(null, handleClass.file);
                        objectToInvestigate = fileObj[objectToInvestigate.handles[nextHandleName].type];
                    }
                }
                var finalNameToSearch = nameAndScope.pop();
                if (objectToInvestigate) {
                    var doneFinding = false;
                    var findingCount = 0;
                    while (!doneFinding) {
                        if (objectToInvestigate.functions[finalNameToSearch] || objectToInvestigate.tasks[finalNameToSearch]) {
                            if (objectToInvestigate.functions[finalNameToSearch]) {
                                return objectToInvestigate.functions[finalNameToSearch].args;
                            }
                            if (objectToInvestigate.tasks[finalNameToSearch]) {
                                return objectToInvestigate.tasks[finalNameToSearch].args;
                            }
                            doneFinding = true;
                        } else {
                            doneFinding = false;
                            if (!objectToInvestigate.extends) {
                                return null;
                            }
                            if (objectToInvestigate.baseClasses && objectToInvestigate.baseClasses[objectToInvestigate.extends]) {
                                var fileObj = ParseSVfile.parseSVfile(null,objectToInvestigate.baseClasses[objectToInvestigate.extends].file);
                                objectToInvestigate = fileObj[objectToInvestigate.extends];
                            } else {
                                var obj = ifClassAvailableInCache(objectToInvestigate.extends);
                                if (obj) {
                                    var fileObj = ParseSVfile.parseSVfile(null, obj.file);
                                    objectToInvestigate = fileObj[objectToInvestigate.extends];
                                } else {
                                    return null;
                                }
                            }
                        }
                    }
                } else {
                    return null;
                }
            }
            return null;
        }
    }



    function resolveScope (nameAndScope, pos, path, doc) { //TODO : Improve performance ........
        //  return null; // remove this after bug fix....
        isDebug=ParserUtils._isDebugOn();
        if(isDebug)console.log("resolveScope calling...");
        var from = 0,
            to = doc.size - 1,
            out = [];
        $.ajaxSetup({async: false});
        doc.iter(from, to, function (line) { out.push(line.text); });
        $.ajaxSetup({async: true});
        out = ParseSVfile.removeComments(out);


        var basePath = fileUtils.getDirectoryPath(path);
        var ParsedFile = ParseSVfile.parseSVfile(out);
        var singleCacheObj;
        var currClassObj;
        var methodList;
        for (singleCacheObj in ParsedFile) {
            var currObj = ParsedFile[singleCacheObj];
            if (currObj.startLine.lineNum < pos.line && currObj.endLine.lineNum > pos.line) {
                var objectToInvestigate = currObj;
                if (nameAndScope.length > 1) {
                    if (nameAndScope[nameAndScope.length -1] === "super") {
                        var temp = nameAndScope.pop();
                        objectToInvestigate = ParseSVfile.parseSVfile(null,currObj.baseClasses[currObj.extends].file);
                        objectToInvestigate = objectToInvestigate[currObj.extends];
                    }
                    if (nameAndScope[nameAndScope.length -1] === "this") {
                        var temp = nameAndScope.pop();
                        objectToInvestigate = currObj;
                    }
                }
                if (nameAndScope.length > 1) {
                    while (nameAndScope.length > 1) {
                        var nextHandleName = nameAndScope.pop();
                        var handleClass;
                        if (objectToInvestigate.handles[nextHandleName]) {
                            if (objectToInvestigate.handles[nextHandleName].handleClass) {
                                handleClass = objectToInvestigate.handles[nextHandleName].handleClass;
                            } else {
                                handleClass = ifClassAvailableInCache(objectToInvestigate.handles[nextHandleName].type);
                                if (!handleObj) {
                                    return null;
                                }
                            }
                        } else {
                            return null;
                        }
                        var fileObj = ParseSVfile.parseSVfile(null, handleClass.file);
                        objectToInvestigate = fileObj[objectToInvestigate.handles[nextHandleName].type];
                    }
                }
                if (objectToInvestigate) {
                    var nameToFind = nameAndScope.pop();
                    if (nameToFind === "super") {
                        return objectToInvestigate.extends;
                    } else if (nameToFind === "this") {
                        return objectToInvestigate.name;
                    } else {
                        return objectToInvestigate.handles[nameToFind].type;
                    }
                } else {
                    return null;
                }
            }
            return null;
        }
    }



    function getCacheObjWithHierarchy (name) {
        isDebug=ParserUtils._isDebugOn();
        if(isDebug)console.log("getCacueObjWithHier calling...");
        var chacheObj = ifClassAvailableInCache(name);
        if (chacheObj) {
            chacheObj.hierarchy = [];
            if (chacheObj.extends) {
                var baseCacheObj = ifClassAvailableInCache(chacheObj.extends);
                while(baseCacheObj.extends) {
                    chacheObj.hierarchy.push(baseCacheObj);
                    if (baseCacheObj.extends && baseCacheObj.extends !== "uvm_component" && baseCacheObj.extends !== "uvm_object") {
                        baseCacheObj = ifClassAvailableInCache(baseCacheObj.extends);
                    } else {
                        baseCacheObj = null;
                    }
                }
            }
            return chacheObj;
        }
        return null;
    }

    function getAllMethodsInClass (classObj) {
        isDebug=ParserUtils._isDebugOn();
        var eachMethod;
        var methodList = {};
        if (classObj.hierarchy && classObj.hierarchy.length > 0) {
            var i;
            for(i = classObj.hierarchy.length - 1; i <=0; --i) {
                var currHierarchy = classObj.hierarchy[i];
                if (currHierarchy.methods) {
                    for(eachMethod in currHierarchy.methods) {
                        methodList[eachMethod] = currHierarchy.methods[eachMethod];
                    }
                }
            }
        }
        if (classObj.methods) {
            for(eachMethod in classObj.methods) {
                methodList[eachMethod] = classObj.methods[eachMethod];
            }
        }
        return methodList;
    }

    exports.getBaseClass 		   	   = getBaseClass;
    exports.ifClassAvailableInCache    = ifClassAvailableInCache;
    exports.getDocFromPath 			   = getDocFromPath;
    exports.readCacheFile 			   = readCacheFile;
    exports.getHandleFromObject 	   = getHandleFromObject;
    exports.getMethodHintsFromCacheObj = getMethodHintsFromCacheObj;
    exports.getMethodInfo              = getMethodInfo;
    exports.getCurrClassHints          = getCurrClassHints;
    exports.resolveScope               = resolveScope;
    exports.getCurrClass               = getCurrClass;
    exports.version                    = version;
    exports.previous_version           = previous_version;
});
