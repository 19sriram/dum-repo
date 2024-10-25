
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
path = require('path');

const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

/**
 * Uploads the given file to Gemini.
 *
 * See https://ai.google.dev/gemini-api/docs/prompting_with_media
 */
async function uploadToGemini(path, mimeType) {
  const uploadResult = await fileManager.uploadFile(path, {
    mimeType,
    displayName: path,
  });
  const file = uploadResult.file;
  console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
  return file;
}

/**
 * Waits for the given files to be active.
 *
 * Some files uploaded to the Gemini API need to be processed before they can
 * be used as prompt inputs. The status can be seen by querying the file's
 * "state" field.
 *
 * This implementation uses a simple blocking polling loop. Production code
 * should probably employ a more sophisticated approach.
 */
async function waitForFilesActive(files) {
  console.log("Waiting for file processing...");
  for (const name of files.map((file) => file.name)) {
    let file = await fileManager.getFile(name);
    while (file.state === "PROCESSING") {
      process.stdout.write(".")
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      file = await fileManager.getFile(name)
    }
    if (file.state !== "ACTIVE") {
      throw Error(`File ${file.name} failed to process`);
    }
  }
  console.log("...all files ready\n");
}

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

async function run() {
  // TODO Make these files available on the local file system
  // You may need to update the file paths
  const filePath = path.resolve(__dirname, 'zr1.csv');

  const files = [
    await uploadToGemini(filePath, "text/csv")
];

  // Some files have a processing delay. Wait for them to be ready.
  await waitForFilesActive(files);

  const chatSession = model.startChat({
    generationConfig,
    history: [
      {
        role: "user",
        parts: [
          {
            fileData: {
              mimeType: files[0].mimeType,
              fileUri: files[0].uri,
            },
          },
          {text: "read customers review column from sheet1 and classify whether the text comes under \"quantity issue, quality issue, item missing issue, taste issue or other issue\". show output in json format for all reviews in column now and atlast write them to the file in new column under \"google rating\" and make them downloadbale as .csv format"},
        ],
      },
      {
        role: "model",
        parts: [
          {text: "```python\nimport pandas as pd\nimport json\n\n# Load the Excel file\ndf = pd.read_excel(\"Zomato Review Report July-24.xlsx\")\n\n# Define a dictionary to map review text to issue categories\nissue_categories = {\n    \"quantity issue\": [\"too little\", \"not enough\", \"small portion\", \"quantity less\"],\n    \"quality issue\": [\"stale\", \"bad\", \"not fresh\", \"poor quality\", \"burnt\"],\n    \"item missing issue\": [\"missing\", \"didn't get\", \"forgot\", \"not included\"],\n    \"taste issue\": [\"not good\", \"bland\", \"too spicy\", \"not tasty\", \"disappointing\"],\n    \"other issue\": [\"delivery\", \"service\", \"packaging\", \"price\", \"wrong order\"]\n}\n\n# Function to classify reviews\ndef classify_review(review_text):\n    for issue, keywords in issue_categories.items():\n        for keyword in keywords:\n            if keyword in review_text.lower():\n                return issue\n    return \"other issue\"\n\n# Create a new column for classified issues\ndf[\"Issue Category\"] = df[\"read customers review column from sheet1\"].apply(classify_review)\n\n# Convert the issue categories to a JSON format\ndf[\"Issue Category JSON\"] = df[\"Issue Category\"].apply(lambda x: json.dumps({\"issue\": x}))\n\n# Save the updated DataFrame to a CSV file\ndf.to_csv(\"Zomato Review Report July-24_with_issues.csv\", index=False)\n\nprint(\"CSV file created successfully!\")\n```\n\n**Explanation:**\n\n1. **Import necessary libraries:** `pandas` for DataFrame manipulation, `json` for converting to JSON format.\n2. **Load Excel file:** `df = pd.read_excel(\"Zomato Review Report July-24.xlsx\")` reads the Excel file.\n3. **Define issue categories:** A dictionary `issue_categories` maps issue names to keywords.\n4. **`classify_review` function:** This function iterates through the keywords in each issue category and checks if they are present in the review text. If a keyword is found, it returns the corresponding issue category. If no keyword matches, it returns \"other issue\".\n5. **Create \"Issue Category\" column:** `df[\"Issue Category\"] = df[\"read customers review column from sheet1\"].apply(classify_review)` applies the `classify_review` function to each review in the specified column.\n6. **Create \"Issue Category JSON\" column:** `df[\"Issue Category JSON\"] = df[\"Issue Category\"].apply(lambda x: json.dumps({\"issue\": x}))` converts the issue category to a JSON format.\n7. **Save to CSV:** `df.to_csv(\"Zomato Review Report July-24_with_issues.csv\", index=False)` saves the updated DataFrame to a new CSV file named \"Zomato Review Report July-24_with_issues.csv\".\n\nThis code will:\n\n- Classify each customer review based on the predefined issue categories.\n- Create a JSON string for each issue category.\n- Save the original DataFrame with the new \"Issue Category JSON\" column to a CSV file.\n\nRemember to replace `\"Zomato Review Report July-24.xlsx\"` with the actual name of your Excel file.\n"},
        ],
      },
    ],
  });

  const result = await chatSession.sendMessage("**The specific column you want to use for classifying reviews:** read customers review column from sheet1");
  console.log(result.response.text());
}

run();