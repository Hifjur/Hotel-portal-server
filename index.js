const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectID } = require("mongodb");
const { query } = require("express");
const admin = require("firebase-admin");
const port = process.env.PORT || 5000;
const ObjectId = require("mongodb").ObjectId;
const stripe = require("stripe")(process.env.STRIPE_SECRET);
//jwt verification
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//middlewawire
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.af0nh.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function verifyToken(req, res, next) {
  if (req.headers?.authorization?.startsWith("Bearer ")) {
    const token = req.headers.authorization.split(" ")[1];

    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch (error) {}
  }
  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db("HotelPortal");
    const hotelsCollection = database.collection("hotels");
    const usersCollection = database.collection("users");
    const bookingCollection = database.collection("bookings");

    app.get("/hotels", async (req, res) => {
      const cursor = hotelsCollection.find();
      const hotels = await cursor.toArray();
      res.json(hotels);
    });

    app.post("/hotels", async (req, res) => {
      const hotels = req.body;
      const result = await hotelsCollection.insertOne(hotels);
      console.log(result);
      res.json(result);
    });

    app.delete("/hotel/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      console.log("delete", id);
      const query = { _id: ObjectId(id) };
      const result = await hotelsCollection.deleteOne(query);
      res.json(result);
    });

    app.post("/bookings", async (req, res) => {
      const order = req.body;
      const result = await bookingCollection.insertOne(order);
      console.log(result);
      res.json(result);
    });

    app.get("/hotels/:_id", async (req, res) => {
      const _id = req.params._id;
      const query = { _id: ObjectId(_id) };
      const hotel = await hotelsCollection.findOne(query);
      res.json(hotel);
    });

    app.get("/bookings", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const cursor = bookingCollection.find(query);
      const result = await cursor.toArray();
      res.json(result);
    });
    app.get("/bookings/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);

      res.json(booking);
    });
    app.put("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          payment: payment,
        },
      };
      const result = await bookingCollection.updateOne(filter, updateDoc);
      res.json(result);
    });
    //delete using auto generated unique order id. customer cant see orders from emails, meaning has no access to oderId that was not created by the email.
    app.delete("/bookings", verifyToken, async (req, res) => {
      const id = req.body;
      console.log("delete", id);
      const query = { orderId: id.orderId };
      const result = await bookingCollection.deleteOne(query);
      res.json(result);
    });

    app.get("/bookings/admin", verifyToken, async (req, res) => {
      const cursor = bookingCollection.find();
      const orders = await cursor.toArray();
      res.json(orders);
    });
    app.put("/bookings/admin", verifyToken, async (req, res) => {
      const orderId = req.body;

      console.log(orderId);
      const filter = { orderId: orderId.orderId };
      const updateDoc = { $set: { status: "Confirmed" } };
      const result = await bookingCollection.updateOne(filter, updateDoc);
      res.json(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log(user);
      const result = await usersCollection.insertOne(user);
      console.log(result);
      res.json(result);
    });

    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      console.log("put", user);
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.rent * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    });
    //make admin
    app.put("/users/admin", verifyToken, async (req, res) => {
      const user = req.body;
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.json(result);
        }
      } else {
        res.status(403).json({ message: "Permission denied" });
      }
    });
  } finally {
    //await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hotel Portal Server is live");
});

app.listen(port, () => {
  console.log(`listening at ${port}`);
});
