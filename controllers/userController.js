const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const Token = require("../models/tokenModel");
const sendEmail = require("../utils/sendEmail");
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });
};

// Register user

const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  //Validation

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Please fill all required fields");
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error("Password should be at least 6 characters");
  }

  // check if user email already exists
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error("Email has already been used");
  }

  // Create new user

  const user = await User.create({
    name,
    email,
    password,
  });

  // generate token

  const token = generateToken(user._id);

  // send HTTP-only cookie

  res.cookie("token", token, {
    path: "/",
    httpOnly: true,
    expires: new Date(Date.now() + 1000 * 86400), // 1 day
    sameSite: "none",
    secure: true,
  });

  if (user) {
    const { _id, name, email, photo, phone, bio } = user;
    res.status(201).json({
      _id,
      name,
      email,
      photo,
      phone,
      bio,
      token,
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data");
  }
});

// Login User

const loginuser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  // Validate Request

  if (!email || !password) {
    res.status(400);
    throw new Error("Please add email and password");
  }

  // check if user exists
  const user = await User.findOne({ email });

  // User exists check if password is correct

  let isCorrect = user ? true : false;

  if (user) {
    const passwordIsCorrect = await bcrypt.compare(password, user.password);

    if (!passwordIsCorrect) {
      isCorrect = false;
    }
  }

  if (!isCorrect) {
    res.status(400);
    throw new Error("Email or password is incorrect");
  }

  // generate token

  const token = generateToken(user._id);

  // send HTTP-only cookie

  res.cookie("token", token, {
    path: "/",
    httpOnly: true,
    expires: new Date(Date.now() + 1000 * 86400), // 1 day
    sameSite: "none",
    secure: true,
  });

  const { _id, name, photo, phone, bio } = user;
  res.status(200).json({
    _id,
    name,
    email,
    photo,
    phone,
    bio,
    token,
  });
});

// Logout User

const logout = asyncHandler(async (req, res) => {
  res.cookie("token", "", {
    path: "/",
    httpOnly: true,
    expires: new Date(0), // expire it now
    sameSite: "none",
    secure: true,
  });
  return res.status(200).json({
    message: "Successfully Logged out",
  });
});

// get user data

const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    const { _id, name, email, photo, phone, bio } = user;
    res.status(200).json({
      _id,
      name,
      email,
      photo,
      phone,
      bio,
    });
  } else {
    res.status(400);
    throw new Error("User not found");
  }
});

// Get Login Status

const loginStatus = asyncHandler(async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.json(false);
  }
  // verify token
  const verified = jwt.verify(token, process.env.JWT_SECRET);

  if (!verified) {
    return res.json(false);
  }

  return res.json(true);
});

// update user

const updateUser = asyncHandler(async (req, res) => {
  delete req.body.password;
  delete req.body.email;
  const user = await User.findByIdAndUpdate(req.user._id, req.body, {
    new: true,
    runValidators: true,
  }).select("-password");
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  return res.status(200).json(user);
});

// Change Password

const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  const { oldPassword, password } = req.body;

  if (!user) {
    res.status(400);
    throw new Error("User not found, please signup");
  }

  if (!oldPassword || !password) {
    res.status(400);
    throw new Error("Please add old and new password");
  }

  // check if old password matches pass in DB

  const passwordIsCorrect = await bcrypt.compare(oldPassword, user.password);

  // save new pass
  if (passwordIsCorrect) {
    if (password.length < 6) {
      res.status(400);
      throw new Error("Password should be at least 6 characters");
    }
    user.password = password;
    await user.save();
    return res.status(200).json("Password changed successfully");
  }

  res.status(400);
  throw new Error("Old password is incorrect");
});

// forgot password

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User does not exist");
  }

  // Delete token if it exists in DB

  await Token.findOneAndDelete({ userId: user._id });

  // Create reset Token

  let resetToken = crypto.randomBytes(32).toString("hex") + user._id;

  console.log(resetToken);

  // Hash token before saving to DB
  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Save token to DB

  const token = await Token.create({
    userId: user._id,
    token: hashedToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * (60 * 1000), // thirty minutes
  });

  // const token =  await new Token({
  //     userId: user._id,
  //     token: hashedToken,
  //     createdAt: Date.now(),
  //     expiresAt: Date.now() + 30 * (60 * 1000), // thirty minutes
  //   }).save();

  // construct reset Url

  const resetUrl = `${process.env.FRONTEND_URL}/resetpassword/${resetToken}`;

  // Reset email

  const message = `
    <h2>Hello ${user.name}</h2>
    <p>Please use the url below to reset your password.</p>
    <p>This reset link is valid for only 30 minutes.</p>
    
    <a href=${resetUrl} clicktracking=off>${resetUrl}</a>
  `;
  const subject = "Password Reset Request";
  const send_to = user.email;
  const sent_from = process.env.EMAIL_USER;

  try {
    await sendEmail(subject, message, send_to, sent_from);
    res.status(200).json({
      success: true,
      message: "Reset Email Sent",
    });
  } catch (error) {
    res.status(500);
    throw new Error("Email not sent, please try again");
  }
  // console.log(hashedToken);
  // res.status(200).json(token);
});

// Reset Password

const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const { resetToken } = req.params;
  // Hash token, then compare to Token in DB
  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  const userToken = await Token.findOne({
    token: hashedToken,
    expiresAt: { $gt: Date.now() },
  });

  if (!userToken) {
    res.status(500);
    throw new Error("Invalid or expired Token");
  }

  // Find user if still exists

  const user = await User.findById(userToken.userId);

  if (user) {
    user.password = password;
    await user.save();
    await Token.findByIdAndDelete(userToken._id);
    res.status(200).json({
      message: "Password has been Reseted Successfully, Please Login",
    });
  }
});

module.exports = {
  registerUser,
  loginuser,
  logout,
  getUser,
  loginStatus,
  updateUser,
  changePassword,
  forgotPassword,
  resetPassword,
};
