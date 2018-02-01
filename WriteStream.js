let fs  = require('fs');

let EventEmitter = require('events');

class WriteStream extends EventEmitter {
    //构造函数
    constructor(path,options){
        super(path,options);
        this.path = path; //写入路径
        this.flags = options.flags || 'w';//操作修饰符
        this.mode = options.mode || 0o666;//权限
        this.start = options.start || 0;//写入的起始位置
        this.pos = this.start;//文件的写入索引
        this.encoding = options.encoding || 'utf8';//编码
        this.autoClose = options.autoClose;//自动关闭
        this.highWaterMark = options.highWaterMark || 16 * 1024; //默认最高水位线16k
        this.buffers = [];//缓存区 源码里面是链表
        this.writing = false;//标识内部正在写入数据
        this.length = 0;//标识缓存区字节的长度
        this.open();//默认一创建就打开文件
    }

    open(){
        fs.open(this.path, this.flags,this.mode,(err,fd)=>{
            if (err) {
                if (this.autoClose) {
                    this.destory();//打开文件失败 自动关闭
                }
                return this.emit('error',err);
            }
            this.fd = fd;
            this.emit('open');
        })
    }

    write(chunk,encoding,callback){
        chunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk,this.encoding);//此方法只吸入buffer或者字符串
        this.length += chunk.length;//当前缓存区的长度
        if (this.writing) {//如果正在写入数据 则需要把数据放入缓存区里面
            this.buffers.push({
                chunk,
                encoding,
                callback
            })
        } else { //如果当前空闲 直接调用底层写入的方法进行写入 并且在写完以后 清空缓存区
            this.writing = true;
            this._write(chunk,encoding,()=>{
                callback&&callback();
                this.clearBuffer();
            })
        }

        //write方法有一个返回值 表示当前缓存区是否超过了最高水位线 即是否能继续写入
        return this.length < this.highWaterMark;
    }

    _write(chunk,encoding,callback){
        if (typeof this.fd != 'number') { //因为是异步的 文件可能在这个时候并未打开
            return this.once('open',()=>this._write(chunk, encoding, callback));
        }
        fs.write(this.fd,chunk,0,chunk.length,this.pos,(err,bytesWritten)=>{
            if (err) {
                if (this.autoClose) {
                    this.destory();
                }
               return this.emit('error',err);
            }
            this.pos += bytesWritten;

            this.length -= bytesWritten;
            callback&&callback();
        })
    }
    clearBuffer(){
        let data = this.buffers.shift();
        if(data){
                this._write(data.chunk,data.encoding,()=>{
                    data.callback && data.callback();
                    this.clearBuffer();
                })
            }else{
                this.writing = false;
                //缓存区清空了 缓存区如果没有满过 是不会触发这个事件的
                this.emit('drain');
            }
    }
    destory(){
        fs.close(this.fd, () => {
            this.emit('close');
        })
    }
}
module.exports = WriteStream;