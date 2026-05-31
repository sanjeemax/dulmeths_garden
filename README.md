# Dulmeth Garden Project

Welcome to the Dulmeth Garden project! This project is designed to showcase a beautiful garden gallery and maintain a garden journal. Below are the details of the project structure and how to set it up.

## Project Structure

```
dulmeth-garden
├── public
│   ├── index.html          # Main HTML file for the gallery
│   ├── journal.html        # HTML file for the garden journal (restricted access)
│   ├── images
│   │   └── images.json     # JSON file containing image metadata
│   ├── data
│   │   └── updates.json     # JSON file storing remote updates for the journal
│   ├── scripts
│   │   ├── gallery.js       # JavaScript for gallery functionality
│   │   └── journal.js       # JavaScript for managing journal updates
│   └── styles
│       └── main.css        # CSS styles for the application
├── src
│   └── server.js           # Server-side code for handling requests
├── package.json            # npm configuration file
└── README.md               # Project documentation
```

## Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd dulmeth-garden
   ```

2. **Install Dependencies**
   Make sure you have Node.js installed. Then run:
   ```bash
   npm install
   ```

3. **Run the Server**
   Start the server with:
   ```bash
   node src/server.js
   ```

4. **Access the Application**
   Open your web browser and navigate to `http://localhost:3000` to view the gallery. The journal page is accessible at `http://localhost:3000/journal.html`, but it requires authorization.

## Usage Guidelines

- **Gallery**: Users can view images in the gallery, which are loaded from the `images/images.json` file.
- **Garden Journal**: The journal page allows authorized users to view updates about the garden. Updates are fetched from the `data/updates.json` file.

## Contributing

Feel free to submit issues or pull requests if you have suggestions or improvements for the project.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.