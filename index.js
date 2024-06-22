const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wxwisw2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let requestedUsers = [];

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const userCollection = client.db("touristGuideDB").collection("users");
        const spotCollection = client.db("touristGuideDB").collection("spots");
        const storyCollection = client.db("touristGuideDB").collection("stories");
        const bookCollection = client.db("touristGuideDB").collection("books");
        const guideRequestsCollection = client.db("touristGuideDB").collection("requests");

        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        // middlewares 
        const verifyToken = (req, res, next) => {
            //    console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // use verify TourGuide after verifyToken
        const verifyTourGuide = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isTourGuide = user?.role === 'tourGuide';
            if (!isTourGuide) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // users related api
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        app.get('/users/tourGuide/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let tourGuide = false;
            if (user) {
                tourGuide = user?.role === 'tourGuide';
            }
            res.send({ tourGuide });
        })

        app.get('/user', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await userCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/guides/:role', async (req, res) => {
            const role = 'tourGuide';
            console.log(role);
            const query = { role: role }
            const result = await userCollection.find(query).toArray();
            res.send(result);
        });


        app.get('/request-guide', async (req, res) => {
            const result = await guideRequestsCollection.find().toArray();
            res.send(result);
        })

        app.post('/request-guide', async (req, res) => {
            const { user } = req.body;

            // Check if user has already requested
            if (requestedUsers.find(u => u.email === user.email)) {
                return res.status(400).json({ message: 'User has already requested to be a tour guide.' });
            }

            // Simulate saving to database (replace with actual database logic)
            requestedUsers.push(user);

            // Example of sending email to admin (not implemented in this example)
            const result = await guideRequestsCollection.insertOne(user);


            res.status(200).json({ message: 'Request sent successfully' });
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            // insert email if user doesnt exists: 
            // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/tourGuide/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updateProfile = req.body;

            // Check for null or undefined values and handle appropriately
            const profileUpdate = {};
            if (updateProfile.name) profileUpdate.name = updateProfile.name;
            if (updateProfile.email) profileUpdate.email = updateProfile.email;
            if (updateProfile.image) profileUpdate.image = updateProfile.image;
            if (updateProfile.newpass) profileUpdate.password = updateProfile.newpass;

            const updateDoc = {
                $set: profileUpdate
            };

            const result = await userCollection.updateOne(filter, updateDoc, options);
            console.log(result);
            res.send(result);
        });

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.patch('/users/guide/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'tourGuide'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })



        //Spot related API
        app.get('/spots', async (req, res) => {
            const result = await spotCollection.find().toArray();
            res.send(result);
        })

        app.get('/allspots', async (req, res) => {
            const result = await spotCollection.find().toArray();
            res.send(result);
        })

        app.get('/spots/:id', async (req, res) => {
            const id = req.params.id;
            const quary = { _id: new ObjectId(id) }
            const result = await spotCollection.findOne(quary);
            res.send(result);
        })

        // GET wishlist items by user email
        app.get('/wishlist/:email', async (req, res) => {
            const userEmail = req.params.email;
            try {
                const wishlistItems = await spotCollection.find({ wish_email: userEmail }).toArray();
                res.status(200).json(wishlistItems);
            } catch (error) {
                console.error('Error fetching wishlist items:', error);
                res.status(500).json({ message: 'Failed to fetch wishlist items' });
            }
        });

        app.post('/tours', async (req, res) => {
            const newTour = req.body;
            const result = await spotCollection.insertOne(newTour);
            res.send(result);
        });

        app.patch('/wishspots/:id', async (req, res) => {
            const id = req.params.id;
            const { wish, wish_email } = req.body;
            const filter = { _id: new ObjectId(id) };

            try {
                let updateDoc;
                if (wish === 1) {
                    updateDoc = {
                        $addToSet: { wish_email: wish_email }
                    };
                } else {
                    updateDoc = {
                        $pull: { wish_email: wish_email }
                    };
                }

                const result = await spotCollection.updateOne(filter, updateDoc);

                // Check the current status of wish_email array
                const spot = await spotCollection.findOne(filter);
                const wishlistStatus = spot.wish_email.length > 0 ? 1 : 0;

                // Update the wishlist status
                await spotCollection.updateOne(filter, { $set: { wishlist: wishlistStatus } });

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to update wishlist" });
            }
        });

        // DELETE wishlist item by ID
        app.delete('/wish/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const result = await spotCollection.deleteOne({ _id: new ObjectId(id) });
                res.status(200).json(result);
            } catch (error) {
                console.error('Error deleting wishlist item:', error);
                res.status(500).json({ message: 'Failed to delete wishlist item' });
            }
        });



        //Story api
        app.get('/stories', async (req, res) => {
            const result = await storyCollection.find().toArray();
            res.send(result);
        })

        app.get('/allstories', async (req, res) => {
            const result = await storyCollection.find().toArray();
            res.send(result);
        })

        app.get('/story/:id', async (req, res) => {
            const id = req.params.id;
            const quary = { _id: new ObjectId(id) }
            const result = await storyCollection.findOne(quary);
            res.send(result);
        })

        //request Guide api
        app.get('/request-guide', async (req, res) => {
            const result = await guideRequestsCollection.find().toArray();
            res.send(result);
        })

        app.post('/request-guide', async (req, res) => {
            const { user } = req.body;

            // Check if user has already requested
            if (requestedUsers.find(u => u.email === user.email)) {
                return res.status(400).json({ message: 'User has already requested to be a tour guide.' });
            }

            // Simulate saving to database (replace with actual database logic)
            requestedUsers.push(user);

            // Example of sending email to admin (not implemented in this example)
            const result = await guideRequestsCollection.insertOne(user);


            res.send(result);
        });


        //Booking Collection
        app.get('/booking', async (req, res) => {
            const result = await bookCollection.find().toArray();
            res.send(result);
        })

        app.get('/assigned', async (req, res) => {
            const email = req.query.email;
            //   console.log(req.query);
            const query = { email: email }
            const result = await bookCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/booking/:email', async (req, res) => {
            const email = req.params.email;
            console.log(req.params);
            const query = { tourist_email: email }
            const result = await bookCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/booking', async (req, res) => {
            const newTour = req.body;
            const result = await bookCollection.insertOne(newTour);
            res.send(result);
        });


        app.patch('/users/bookingAccept/:id', verifyToken, verifyTourGuide, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: 'Accepted'
                }
            }
            const result = await bookCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.patch('/users/bookingReject/:id', verifyToken, verifyTourGuide, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: 'Rejected'
                }
            }
            const result = await bookCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })



        app.get('/', (req, res) => {
            res.send('Welcome to Our Tourist Guide!');
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.listen(port, (req, res) => {
    console.log('listening on port ' + port);
})
