import path from "path";
import { ascii2hex, hex2ascii, hex2dec, dec2hex, lenPad, replaceAt } from "./utils";

export class FilerefData {
    header: string;
    diskName: string;
    location: string;
    footer: string;
    external: boolean;
    constructor(header: string, diskName: string, location: string,
                footer: string, external: boolean) {
        this.header = header;
        this.diskName = diskName;
        this.location = location;
        this.footer = footer;
        this.external = external;
    }
    getFileName() {
        return path.parse(this.location).base;
    }
    getDir() {
        return path.basename(path.dirname(this.location));
    }
    getLocation(delminator: string) {
        return this.location.split(path.sep).join(delminator);
    }
    getDiskName() {
        return this.diskName;
    }
    getHeader() {
        return this.header;
    }
    getFooter() {
        return this.footer;
    }
    isExternal() {
        return this.external;
    }
    setLocation(location: string) {
        // Store the absolute location but donot have the deliminator in the start
        location = path.resolve(location);
        if (location[0] == path.sep) location = location.substr(1);
        this.location = location;
    }
}

function headEnd(stream:string) : number {
    for (let index = 0; index < stream.length; index++) {
        // Find the control code 0200
        let i = stream.indexOf('0200', index);
        if  (i == -1) throw Error("Data of the ref cannot be recognised: 0200");
        // Check if the control code is exactly the one we need
        let locationLength = hex2dec(stream.substr(i + 4, 2));
        let controlPos = i + 6 + lenPad(locationLength).length + (locationLength * 2);
        if (stream.substr(controlPos, 4) == '0E00') {
            return i;
        }
        index = i > index ? i : index;
    }
    throw Error("Data of the ref cannot be recognised: 0200");
    return -1;
}

export function unmarshall(stream: string) {
    let cntr = headEnd(stream);
    let header = stream.substr(0, cntr); 
    // Next 4 control code
    cntr += 4;
    // Next 2 location length
    let locationLength = hex2dec(stream.substr(cntr, 2));
    cntr += 2;
    // Next locationLength as Location
    cntr += locationLength * 2;
    // Padding
    cntr += lenPad(locationLength).length;
    // Next 4 control code
    if(stream.substr(cntr, 4) != '0E00') throw Error("Data of the ref cannot be recognised: 0E00");
    // Length of total name length blob, 2 padding
    cntr += 4;
    // length of name string, 2 padding
    let nameLength = hex2dec(stream.substr(cntr, 2));
    cntr += 4;
    // Name length with each char with 2 padding
    cntr += nameLength * 2;

    // Next 4 control code
    if(stream.substr(cntr, 4) != '0F00') throw Error("Data of the ref cannot be recognised: 0F00");
    cntr += 4;
    // Length of total sytem name length blob, 2 padding
    cntr += 4;
    // length of disk name string, 2 padding
    let diskNameLength = hex2dec(stream.substr(cntr, 2));
    cntr += 4;
    // Name length with each char with 2 padding
    let diskName = hex2ascii(stream.substr(cntr, diskNameLength * 4));
    cntr += diskNameLength * 4;

    // Next 4 control code
    if(stream.substr(cntr, 4) != '1200') throw Error("Data of the ref cannot be recognised: 1200");
    cntr += 4;
    // length of disk name string
    locationLength = hex2dec(stream.substr(cntr, 2));
    cntr += 2;
    // Name length with each char with 2 padding
    let location = hex2ascii(stream.substr(cntr, locationLength * 2));
    cntr += locationLength * 2;
    cntr += locationLength % 2 == 0 ? 2 : 4;

    // Next 4 control code
    if(stream.substr(cntr, 4) != '1300') throw Error("Data of the ref cannot be recognised: 1300");
    // TODO: The footer would go down
    let footer = stream.substr(cntr);
    cntr += 4;
    let diskLocationLength = hex2dec(stream.substr(cntr, 2));
    cntr += 2;
    let diskLocation = hex2ascii(stream.substr(cntr, diskLocationLength * 2));
    // TODO: Not sure if this works with windowss
    let isExternal = diskLocation != '/';
    return new FilerefData(header, diskName, path.join(diskLocation, location), footer, isExternal);
}

export function marshall(data: FilerefData) {
    // Starting 8 Padding, 4 total length, 6 unknown  
    let stream: string = data.getHeader();
    // Control Code
    stream += '0200';
    // length + 2, location with delminator :
    stream += dec2hex(data.getLocation(':').length + 2);
    stream += ascii2hex('/:' + data.getLocation(':'));
    stream += lenPad(data.getLocation(':').length);
    // Control Code
    stream += '0E00';
    // length of the file name with padding and length header (12*2 + 2 = 26), 2 padding
    stream += dec2hex((data.getFileName().length * 2) + 2) + '00';
    stream += dec2hex(data.getFileName().length) + '00';
    stream += ascii2hex(data.getFileName().split('').join('\0')) + '00';
    // Control Code
    stream += '0F00';
    // length of the disk name with padding and length header (12*2 + 2 = 26), 2 padding
    stream += dec2hex((data.getDiskName().length * 2) + 2) + '00';
    stream += dec2hex(data.getDiskName().length) + '00';
    stream += ascii2hex(data.getDiskName().split('').join('\0')) + '00';
    // Control Code
    stream += '1200';
    stream += dec2hex(data.getLocation('/').length);
    stream += ascii2hex(data.getLocation('/'));
    stream += lenPad(data.getLocation('/').length);
    // Unknwon end
    stream += data.getFooter();
    // Total size update
    let lenStr = dec2hex(stream.length / 2);
    stream = replaceAt(stream, lenStr, 8);
    return stream;
}