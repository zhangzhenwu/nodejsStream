### 背景
之前在开发ASP.NET的时候，根据源代码依次追踪整个程序的执行过程，发现最重要的过程是基于一个管道流的，像水管一样，依次处理管道流中的十几个事件，当时对流的认知是四个字，依次执行。那么现在做Node的开发，对于Node中的流是另四个字，那就是源源不断。本篇文章主要目的是带大家手写可读流与可写流。
### 简介
在Node中，请求流，响应流，文件流等都是基于stream模块封装的。简单的理解，流就是将大块的东西，分小块依次处理。就像你需要10kg的水，水管就一点点的源源不断的流出来给你。又如在程序中
```
fs.readFileSync('/demo.txt', {encoding:'utf8'});fs.writeFileSync('/demo.txt', data);
```
以上两个方法是把文件内容全部读入内存，然后再写入文件，但是如果文件过大就会出现问题了，内存容易爆掉。这里就需要用到流了，一点点的读取或者写入。
### 分类
* Readable - 可读的流 (例如 fs.createReadStream()).
* Writable - 可写的流 (例如 fs.createWriteStream()).
* Duplex - 可读写的流 (例如 net.Socket).
* Transform - 在读写过程中可以修改和变换数据的 Duplex 流 (例如 zlib.createDeflate()).

### Readable - 可读的流介绍与实现
可读流分为两种模式：flowing 和 paused，并且两种模式可以相互转换

1.在 flowing 模式下， 可读流自动从系统底层读取数据，并通过 EventEmitter 接口的事件尽快将数据提供给应用。

2.在 paused 模式下，必须显式调用 stream.read() 方法来从流中读取数据片段。

3.所有初始工作模式为 paused 的 Readable 流，可以通过下面三种途径切换到 flowing 模式：

- 监听 'data' 事件
- 调用 stream.resume() 方法
- 调用 stream.pipe() 方法将数据发送到 Writable

4.可读流可以通过下面途径切换到 paused 模式：

- 如果不存在管道目标（pipe destination），可以通过调用 stream.pause() 方法实现。
- 如果存在管道目标，可以通过取消 'data' 事件监听，并调用 stream.unpipe() 方法移除所有管道目标来实现。

5.为了便于理解，这里分开写两种模式，下面为flowing模式基本实现

流程图：

![](https://user-gold-cdn.xitu.io/2018/2/1/1615058133d104eb?w=742&h=413&f=png&s=71157)

* 定义类首先要继承自EventEmitter，因为要发射监听事件，在构造函数中依次定义各个参数，其中需要说明的是this.flowing 用于切换模式，this.buffer并非是缓存，因为流动模式是默认不走缓存的，这个buffer是读取的时候fs.read的一个参数，所有的事件监听到都会执行newListener。当该类被构造的时候就打开文件，并监听事件，如果是data，默认走流动模式开始读取。
```
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
```

* open方法 打开传入路径的文件 如果出错并且设置自动关闭属性，直接关闭打开，发射error事件。如果成功了，发射open事件，供读取方法接收。
```
 open() {
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
```

* 最重要的方法Read，一进入就需要判断文件是否已经打开了，因为文件打开是异步的一个过程，此时可能并未打开，如果没有打开就监听发射的open事件，然后在回调函数中进行read方法的调用。其中核心是每次需要读多少，这个量由传入的开始结束位置已经最高水位线决定的。最高水位线代表依次最多读取多少，默认值是64kb。那么每次读取的值 howMuchToRead = this.end?Math.min(this.end - this.pos + 1,this.highWaterMark):this.highWaterMark;
```
read(){
        if(typeof this.fd != 'number'){
            return this.once('open',()=>this.read());
        }
        let howMuchToRead = this.end?Math.min(this.end - this.pos + 1,this.highWaterMark):this.highWaterMark;
        fs.read(this.fd,this.buffer,0,howMuchToRead,this.pos,(err,bytes)=>{//bytes是实际读到的字节数
            if(err){
                if(this.autoClose)
                    this.destroy();
                return this.emit('error',err);
            }
            if(bytes){
                let data = this.buffer.slice(0,bytes);
                this.pos += bytes;
                data = this.encoding?data.toString(this.encoding):data;
                this.emit('data',data);
                if(this.end && this.pos > this.end){
                   return this.endFn();
                }else{
                    if(this.flowing)
                      this.read();
                }
            }else{
                return this.endFn();
            }

        })
    }
```

* pipe方法实现 pipe方法就是边读取边写入，控制读写速度，当可写流的写入返回false时，暂停读取，当可写流触发drain事件后，恢复读取。
```
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
```

6. 暂停模式 暂停模式不同的是需要走缓存，并且监听的是readable事件（这里我只贴出具有差异性的代码）
流程图

![](https://user-gold-cdn.xitu.io/2018/2/1/1615058992b40e71?w=713&h=418&f=png&s=19314)
* 在构造函数中需要加入this.buffers = [];（源码中为了提高效率，使用的是链表结构，这里我用数组代替），以及readable事件的监听。
```
 this.on('newListener', (type) => {
            if (type == 'data') {
                this.flowing = true;
                this.read();
            }
            if (type == 'readable') {
                this.read(0);
            }
        });
```

* 这里read方法需要传入一个n，表示需要读取的字节数。如果判断缓存的大小，即this.length,如果this.length == 0 || this.length < this.highWaterMark ，执行_read()方法,此时执行的n为0 
```
 let _read = () => {
            let m = this.end ? Math.min(this.end - this.pos + 1, this.highWaterMark) : this.highWaterMark;
            fs.read(this.fd, this.buffer, 0, m, this.pos, (err, bytesRead) => {
                if (err) {
                    return
                }
                let data;
                if (bytesRead > 0) {
                    data = this.buffer.slice(0, bytesRead);
                    this.pos += bytesRead;
                    this.length += bytesRead;
                    if (this.end && this.pos > this.end) {
                        if (this.needReadable) {
                            this.emit('readable');
                        }

                        this.emit('end');
                    } else {
                        this.buffers.push(data);
                        if (this.needReadable) {
                            this.emit('readable');
                            this.needReadable = false;
                        }

                    }
                } else {
                    if (this.needReadable) {
                        this.emit('readable');
                    }
                    return this.emit('end');
                }
            })
        }
```

* 如果传入的n值 0 < n < this.length，走以下逻辑,即从缓存区中读取相应的字节数进行读取
```
  if (0 < n < this.length) {
            ret = Buffer.alloc(n);
            let b;
            let index = 0;
            while (null != (b = this.buffers.shift())) {
                for (let i = 0; i < b.length; i++) {
                    ret[index++] = b[i];
                    if (index == ret.length) {
                        this.length -= n;
                        b = b.slice(i + 1);
                        this.buffers.unshift(b);
                        break;
                    }
                }
            }
            if (this.encoding) ret = ret.toString(this.encoding);
        }

```

### Writable - 可读的流介绍与实现
流程图

![](https://user-gold-cdn.xitu.io/2018/2/1/1615058e626d8a1a?w=726&h=407&f=png&s=62647)
* 构造函数跟上面差距不大，有一个this.buffer的缓存区，并且最高水位线默认为16k
```
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
```

* open即打开文件是一样的，这里不再描述。最重要的write方法，具体写入是执行的_write方法，其中有一个this.writing 标识是否正在写入，如果正在写入，则放入缓存区中，在清空缓存区的时候依次取出写入，即以下的clearBuffer方法，此方法中当缓存区清空了以后触发drain事件，这里需要特殊说明一下，如果缓存区从未满过，是不会触发这个事件的。
```
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
```

### 参考链接
1. [Node.js API文档](http://nodejs.cn/api/stream.html)
2. [深入理解 Node Stream 内部机制](http://www.barretlee.com/blog/2017/06/06/dive-to-nodejs-at-stream-module/)

