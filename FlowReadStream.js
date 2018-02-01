let EventEmitter = require('events');
let fs = require('fs');
class ReadStream extends EventEmitter{
    constructor(path,options){
        super(path,options);
        this.path = path;//写入路径
        this.flags = options.flags || 'r'; //操作修饰符
        this.mode = options.mode || 0o666; //权限
        this.autoClose = options.autoClose;//是否自动关闭
        this.highWaterMark = options.highWaterMark || 64 * 1024; //默认64k
        this.pos = this.start = options.start || 0;//起始位置
        this.end = options.end;//结束位置
        this.encoding = options.encoding;//编码
        this.flowing = null;//流动模式
        this.buffer = Buffer.alloc(this.highWaterMark);//读取的buffer 不是缓存
        this.open();
        this.on('newListener',(type,listener)=>{
            if (type == 'data') {
                this.flowing = true;
                this.read();
            }
        })
    }
    read(){
        if (typeof this.fd != 'number') {
             return this.once('open',()=>this.read());
        }
        //需要读多少
        let howMuchToRead = this.end?Math.min(this.end - this.pos + 1,this.highWaterMark):this.highWaterMark;
        fs.read(this.fd,this.buffer,0,howMuchToRead,this.pos,(err,readBytes)=>{
            if (err) {
                if (this.autoClose) {
                    this.destroy();
                }
                return this.emit('error',err);
            }
            if (readBytes) {
                let rData = this.buffer.slice(0,readBytes);
                this.pos += readBytes;
                rData = this.encoding ? rData.toString(this.encoding) : rData;
                this.emit('data',rData);
                if (this.end && this.pos > this.end) {
                    return this.exit();
                }else{
                    // this.read();
                    if (this.flowing) {
                        this.read();
                    }
                }
            }else{
                return this.exit();
            }
        })
    }
    exit(){
        this.emit('end');
        this.destroy();
    }
    open(){
        fs.open(this.path,this.flags,this.mode,(err,fd)=>{
               if(err){
                   if(this.autoClose){
                       this.destroy();
                       return this.emit('error',err);
                   }
               }
               this.fd = fd;
               this.emit('open');
        })
    }
    destroy(){
        fs.close(this.fd,()=>{
            this.emit('close')
        })
    }
    pipe(ws){
        this.on('data',data =>{
            let flag = ws.write(data);
            if (!flag) {
                this.pause();
            }
        })
        ws.on('drain',()=>{
            this.resume();
        })
    }
    pause(){
        this.flowing  = false;
    }
    resume(){
        this.flowing  = true;
        this.read();
    }
}
module.exports = ReadStream;