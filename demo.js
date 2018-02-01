let fs = require('fs');

let rs = fs.createReadStream('./demo.txt', {
    highWaterMark:4
}); 

let arr =[];
rs.on('data',(chunk)=>{
    arr.push(chunk);
    console.log(chunk.toString());
});

rs.on('end',()=>{
    console.log(Buffer.concat(arr).toString());
})