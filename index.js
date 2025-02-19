import express from "express";
import pg from "pg";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import env from "dotenv";
import axios from "axios";

const app = express();
const port = 3000;
env.config();

app.use(cors());      //Middleware
app.use(express.json()); //Allows us to accept JSON data in the req.body
app.use(express.static("public"));  //Passing the public folder for the images
                                    //making it accessible.


//----------------IMAGE STORAGE-----------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {

    const newId = req.body.id;
    
    const dir = `public/images/${newId}`;

    if(!fs.existsSync(dir)){  //making a dir with the users id to store the pics there
      fs.mkdir(dir, err => cb(err, dir));
    }
    else{
      cb(null, dir);
    }
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
    //        image + _ + milliseconds elapsed since the epoch + extension(.jpg)
  }
})


const upload = multer({
  storage: storage
})
//---------------------------------------------------------

const db = new pg.Client({
    user: process.env.USER,
    host: process.env.HOST,
    database: process.env.DATABASE_NAME,
    password: process.env.PASS,
    port: process.env.PORT
  })

db.connect();


//GET DATA BY ID-----------------------------------------------------------------------------------------------------------
app.get("/data/:id", async(req, res) => {
  
  const newId = req.params.id;
  
  try{
    const sqlCode =`SELECT p.id, first_name, last_name, e_mail, certificate, school, place, about_me, links, profile_pic, profile_background
                    FROM profile p 
                    INNER JOIN profile_details pd 
                    ON p.id = pd.id 
                    WHERE p.id=$1`;
    
    const todo = await db.query(sqlCode, [newId]);
    
    res.json(todo.rows[0]);     //Sends data two times
  }
  catch (error) {
    res.json(error);
  }
})

//GET ALL THE USER PUBLISHED POSTS-----------------------------------------------------------------------------------------
app.get("/posts/:id", async(req, res) => {

  const newId = req.params.id;

  try {
    const data = await db.query("SELECT * FROM profile_posts WHERE id=$1 ORDER BY date DESC", [newId]);
    
    res.json(data.rows);
  } catch (error) {
    res.json(error);
  }
})

//GET ALL THE USER IMAGES--------------------------------------------------------------------------------------------------
app.get("/images/:id", async(req,res) => {

  const newId = req.params.id;

  try {
    const data = await db.query("SELECT image, date, images_id FROM profile_images WHERE id=$1 ORDER BY date DESC", [newId]);

    res.json(data.rows);
  } catch (error) {
    res.json({message: "Error"});
  }
})

//GETS THE NEWS
app.post("/news", async(req, res) => {

  //API keys and secrets are better to store on the server side than on React Front end side
  //bcs of security reasons. 
  //React environment variables are embedded in the build and are publicly accessible.
  const whatToSearch = req.body.what;
  
  try {
    axios.get(process.env.DATABASE_URL + process.env.SESSION_KEY + whatToSearch)
    .then(response => {
      res.json(response.data.results);
    })
    .catch(error => {
       console.log("Im in error");
       console.error(error);
    })
    
  } catch (error) {
    res.json({message: "Error"});
  }
})


//UPDATE THE PROFILE PIC------------------------------------------------------------------------------------
app.post("/upload-profile", upload.single('image'), async(req, res) => {
//NEED TO DO: when changing the profile or back.pic delete the previous one.
  try {
    const image = req.file.filename;
    const newId = req.body.id;
    const oldName = req.body.oldName;
    
    await db.query("UPDATE profile_details SET profile_pic=$1 WHERE id=$2", [image, newId]);

    const path = `public/images/${newId}/${oldName}`;  //Path for the old profile image

    if(fs.existsSync(path)){
      //Deleting the Image from the directory
      fs.unlink(path, (err) => {
        if (err) throw err;
        console.log(path + " was deleted");
      });
    }
    
    res.json({message: image, status: 200}) //returning the image name for updating
  } catch (error) {
    req.json({message:"Error"});
  }
})

//UPDATE THE BACKGROUND PIC------------------------------------------------------------------------------------
app.post("/upload-background", upload.single("image"), async(req, res) => {

  try {
    const image = req.file.filename;
    const newId = req.body.id;
    const oldName = req.body.oldName;

    await db.query("UPDATE profile_details SET profile_background=$1 WHERE id=$2", [image, newId]);
    
    const path = `public/images/${newId}/${oldName}`;

    if(fs.existsSync(path)){
      //Deleting the Image from the directory
      fs.unlink(path, (err) => {
        if (err) throw err;
        console.log(path + " was deleted");
      });
    }

    res.json({message: image, status: 200})
  } catch (error) {
    req.json({message: "Error"});
  }
})



//UPDATE THE DATA------------------------------------------------------------------------------------
app.post("/update-data", async(req, res) => {

  try {
    const firstName = req.body.first_name;
    const lastName = req.body.last_name;
    const certificate = req.body.certificate;
    const school = req.body.school;
    const place = req.body.place;
    const about = req.body.about;
    const linkedIn = req.body.linkedIn;
    const newId = req.body.id;

    await db.query("UPDATE profile_details SET certificate=$1, school=$2, place=$3, about_me=$4, links=$5 WHERE id=$6", 
      [certificate, school, place, about, linkedIn, newId]
    );
    await db.query("UPDATE profile SET first_name=$1, last_name=$2 WHERE id=$3", [firstName, lastName, newId]);

    res.json({message: {newName: firstName, newLastName: lastName, newCert: certificate,
                         newSchool: school, newPlace: place, newAbout: about, newLink: linkedIn}, status: 200});
  } catch (error) {
    req.json({message: "Error"});
  }
})

//POST WITH TEXT AND PIC----------------------------------------------------------------------------
app.post("/post", upload.array("image", 2), async(req, res) => {
    
  try {
    const text = req.body.data;
    const img = req.files[0].filename;
    const newId = req.body.id;
    const date = Date.now();
    
    const postid = await db.query("INSERT INTO profile_posts VALUES ($1, $2, $3, $4) RETURNING posts_id", [newId, text, img, date]);
    
                        //SENDING BACK THE DATA FOR UPDATE
    res.json({message: {id:newId, post:text, pics:img, date: date, postid: postid.rows[0].posts_id}, status: 200});  
  } catch (error) {
    res.json({message: "Error"});
  }
})
//POST TEXT ONLY------------------------------------------------------------------------------------
app.post("/post_textonly", async(req, res) => {

  try {
    const text = req.body.txt;
    const newId = req.body.id;
    const date = Date.now();

    const postid = await db.query("INSERT INTO profile_posts VALUES($1, $2, $3, $4) RETURNING posts_id", [newId, text, "", date]);

    res.json({message: {id: newId, post:text, pics: "", date:date, postid: postid.rows[0].posts_id}, status: 200});
  } catch (error) {
    res.json({message:"Error"});
  }
})
//POST IMAGE ONLY------------------------------------------------------------------------------------
app.post("/post_imgonly", upload.single("image") ,async(req, res) => {

  try {
    const img = req.file.filename;
    const newId = req.body.id;
    const date = Date.now();

    const imgsID = await db.query("INSERT INTO profile_images VALUES($1, $2, $3) RETURNING images_id", [newId, img, date]);

    res.json({message: {id: newId, post:img, date: date, imgID: imgsID.rows[0].images_id}, status: 200});
  } catch (error) {
    res.json({message:"Error"});
  }
})


//REGISTRATE-----------------------------------------------------
app.post("/registrate", async(req, res) => {
  
  try {
    const firstName = req.body.name;
    const lastName = req.body.lastName;
    const email = req.body.email;
    const pass = req.body.pass;

    if(firstName === "null" || lastName === "null" || email === "null" || pass === "null"){
      
      res.json({message: "You can't insert null! Try again."});
    }
    else{

      const check = await db.query("SELECT * FROM profile WHERE e_mail = $1", [email]);

      if(check.rowCount !== 0){
        res.json({message: "User with that E-mail already exists!"});
      }
      else{
        const reg = await db.query("INSERT INTO profile(first_name, last_name, e_mail, password) VALUES ($1, $2, $3, $4) RETURNING id", 
                                [firstName, lastName, email, pass]);
      
        const newID = reg.rows[0].id;   //Getting the new id from the newly created profile

        db.query("INSERT INTO profile_details(id) VALUES($1)", [newID]);

        res.status(200).json({message: "Successfully registered, you can now login.", status: 200});
      }
      
    }

  } catch (error) {
    console.log(error);
  }
})

//LOGIN AUTHENTICATION---------------------------------------------
app.post("/login", async(req, res) => {

  try {
    const name = req.body.name;
    const email = req.body.email;
    const pass = req.body.pass;
    
    const data = await db.query("SELECT * FROM profile WHERE first_name = $1 AND e_mail = $2 AND password = $3", 
                                [name, email, pass]);

                      
    if(data.rowCount !== 0){

      const userID = data.rows[0].id;

      const imageName = await db.query("SELECT profile_pic FROM profile_details WHERE id=$1", [userID]);

      res.json({message: true, id: userID, imageName: imageName.rows[0].profile_pic});
    }
    else{
      res.json({message: false});
    }

  } catch (error) {
    console.log(error.message);
  }
})



//DELETE---------------------------------------------------------
app.delete("/delete/:id" , async(req, res) => {
  try {
    const{id} = req.params;
    const deleteData = await db.query("DELETE FROM profile WHERE id=$1", [id]);

    const path = `public/images/${id}`;
    
    if(fs.existsSync(path)){
      //Deleting the directory
      fs.rmSync(path, { recursive: true, force: true }
      );
    }

    res.json({message: "Profile is deleted successfully."});
  } catch (error) {
    console.log(error);
    res.json({message: "Error"});
  }
})

//DELETE PROFILE-PIC OR BACKGROUND-PIC
app.post("/delete-img", async(req, res) => {
  try {
    const data = req.body.what;
    const picName = req.body.name;
    const newId = req.body.id;

    if(data === "profile_background"){
                   //`UPDATE profile_details SET ${data}=$1 WHERE id=$2`
      await db.query("UPDATE profile_details SET profile_background=$1 WHERE id=$2", [null, newId]);
    }
    else{
      await db.query("UPDATE profile_details SET profile_pic=$1 WHERE id=$2", [null, newId]);
    }

    const path = `public/images/${newId}/${picName}`;
    
    if(fs.existsSync(path)){
      //Deleting the Image from the directory
      fs.unlink(path, (err) => {
        if (err) throw err;
        console.log(path + "was deleted");
      });
    }
    
    res.json({message: "Updated", status: 200});
  } catch (error) {
    console.log(error);
    res.json({message: error});
  }
})

//DELETE THE IMAGE POST
app.post("/delete_imgpost", async(req, res) => {
  try {
    const profileID = req.body.profileID;
    const imgID = req.body.id;
    const name = req.body.name;
    
    await db.query("DELETE FROM profile_images WHERE images_id=$1", [imgID]);

    const path = `public/images/${profileID}/${name}`;

    if(fs.existsSync(path)){
      //Deleting the Image from the directory
      fs.unlink(path, (err) => {
        if (err) throw err;
        console.log(path + " was deleted");
      });
    }

    res.json({message: imgID, status: 200});
  } catch (error) {
    res.json({message: "Error"});
  }
})

//DELETE THE POST
app.post("/delete-post", async(req, res) => {
  try {
    const profileID = req.body.profileID;
    const postID = req.body.id;
    const name = req.body.name;
    
    await db.query("DELETE FROM profile_posts WHERE posts_id=$1", [postID])

    const path = `public/images/${profileID}/${name}`;

    if(fs.existsSync(path) &&  name !== ""){
      //Deleting the Image from the directory
      fs.unlink(path, (err) => {
        if (err) throw err;
        console.log(path + " was deleted");
      });
    }
    
    res.json({message: postID, status: 200});
  } catch (error) {
    res.json({message: "Error"});
  }
})




app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});