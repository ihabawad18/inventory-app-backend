const errorHandler = (err, req , res ,next) =>{
    const statusCode = res.statusCode ? res.statusCode : 500;
    res.status(statusCode);
    if(process.env.NODE_ENV === "production"){
        return res.json({
            message: err.message
        })
    }
    res.json({
        message: err.message,
        stack: err.stack
    })
}

module.exports = errorHandler;