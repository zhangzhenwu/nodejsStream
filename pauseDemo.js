let ReadStream = require('./pauseReadStream.js');
let rs = new ReadStream('./1.txt',{
   highWaterMark:3,
    encoding:'utf8'
});
rs.on('readable',function () {
    console.log(rs.length);
    let char = rs.read(1);
    console.log(char);
    console.log(rs.length);
    setTimeout(()=>{
        console.log(rs.length);
    },500)
})
