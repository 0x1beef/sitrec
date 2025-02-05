<?php
// need to modify php.ini?
// /opt/homebrew/etc/php/8.4/php.ini
// brew services restart php

require('./user.php');

$user_id = getUserID();

$aws=null;

function startS3() {
    require 'vendor/autoload.php';
    global $aws;
    global $s3creds;

    $aws = $s3creds;

    // Get it into the right format
    $credentials = new Aws\Credentials\Credentials($aws['accessKeyId'], $aws['secretAccessKey']);

    // Create an S3 client
    $s3 = new Aws\S3\S3Client([
        'version' => 'latest',
        'region' => $aws['region'],
        'credentials' => $credentials
    ]);
    return $s3;
}


// if we were passed the parameter "getuser", then we just return the user_id
if (isset($_GET['getuser'])) {
    echo $user_id;
    exit();
}

$userDir = getUserDir($user_id);

// need to be logged in, and a memmber of group 9 (Verified users)
if ($user_id == 0 /*|| !in_array(9,$user->secondary_group_ids)*/) {
    http_response_code(501);
    exit("Internal Server Error");
}

$isLocal = false;

if ($_SERVER['HTTP_HOST'] === 'localhost' || $_SERVER['SERVER_NAME'] === 'localhost') {
    // for local testing
    $storagePath = "https://localhost/sitrec-upload/";
    $isLocal = true;
} else {
    $storagePath = $uploadURL;  // from config.php
}

function writeLog($message) {
//    global $logPath;
//    // Ensure message is a string
//    if (!is_string($message)) {
//        $message = print_r($message, true);
//    }
//
//    // Add a timestamp to each log entry for easier tracking
//    $timestamp = date("Y-m-d H:i:s");
//    $logEntry = "[$timestamp] " . $message . "\n";
//
//    // Append the log entry to the log file
//    file_put_contents($logPath, $logEntry, FILE_APPEND);
}

// check to see if we have delete = true
if (isset($_POST['delete']) && $_POST['delete'] == 'true') {
    $filename = $_POST['filename'];
    $version = $_POST['version'] ?? null;

    // exit if the filename contains a path
    if (strpos($filename, '/') !== false) {
        exit(0);
    }

    if ($useAWS) {
        // delete the entire folder from s3
        require 'vendor/autoload.php';
        $s3 = startS3();
    }

    // if no version name is supplied, then we delete the entire folder
    if (!$version) {
        if ($useAWS) {
            $s3Path = $user_id . '/' . $filename . '/';
            $s3->deleteMatchingObjects($aws['bucket'], $s3Path);
        }
        else {

            $dir = $userDir . $filename;
            if (file_exists($dir)) {
                $files = glob($dir . '/*'); // get all file names
                foreach ($files as $file) { // iterate files
                    if (is_file($file)) {
                        unlink($file); // delete file
                    }
                }
                rmdir($dir);
            }
        }

    } else {
        if ($useAWS) {
            // delete the specific version from s3
            $s3Path = $user_id . '/' . $filename . '/' . $version;
            $s3->deleteMatchingObjects($aws['bucket'], $s3Path);
        } else {

            // otherwise we delete the specific version
            $file = $userDir . $filename . '/' . $version;
            if (file_exists($file)) {
                unlink($file);
            }
        }
    }

    exit(0);
}


// Check if file and filename are provided
if (!isset($_FILES['fileContent']) || !isset($_POST['filename'])) {
    die("File or filename not provided");
}

// Retrieve the file and filename
$fileName = $_POST['filename'];
$fileContent = file_get_contents($_FILES['fileContent']['tmp_name']);//    require 'vendor/autoload.php';
$version = $_POST['version'] ?? null;


writeLog(print_r($_FILES, true));
writeLog(print_r($_POST, true));

// Create a filename with MD5 checksum of the contents of the file
$md5Checksum = md5($fileContent);

// Separate the filename and extension
$extension = pathinfo($fileName, PATHINFO_EXTENSION);
$baseName = pathinfo($fileName, PATHINFO_FILENAME);

// Append MD5 checksum before the extension
$newFileName = $baseName . '-' . $md5Checksum . '.' . $extension;

if ($version) {
    // versioned files sit in a folder based on the file name
    // like /sitrec-upload/99999998/MyFile/versionnumber.jpg
    $userDir = $userDir . $baseName . '/';
    $newFileName = $version;  // note we are assuming the front end has supplied a unique version number with the correct extension
    // Create a files specific folder for the user if it doesn't exist
}



if ($useAWS) {
    $s3 = startS3();

    $filePath = $_FILES['fileContent']['tmp_name'];  // Path to the temporary uploaded file
    $fileStream = fopen($filePath, 'r');  // Open a file stream


    $s3Path = $user_id . '/' . $newFileName;
    if ($version) {
        $s3Path = $user_id . '/' . $fileName . '/' . $newFileName;
    }

    // Upload the file using the high-level upload method
    // Using upload instead of putObject to allow for larger files
    // putObject was giving odd timeout errors.
    try {
        $result = $s3->upload(
            $aws['bucket'],
            $s3Path,
            $fileStream,
            $aws['acl']  // Access control list (e.g., 'public-read')
        );

        // Success, print the URL of the uploaded file
        echo $result['ObjectURL'];
    } catch (Aws\Exception\S3Exception $e) {
        // Catch an S3 specific exception.
        http_response_code(555);
        exit("Internal Server Error: " . $e->getMessage());
    } finally {
        if (is_resource($fileStream)) {
            fclose($fileStream);  // Close the file stream to free up resources
        }
    }
    exit (0);
}



// No AWS credentials, so we'll just upload to the local server

// Create the BASE directory for the user if it doesn't exist
//if (!file_exists($userDir)) {
//    mkdir($userDir, 0755, true);
//}



if (!file_exists($userDir)) {
    mkdir($userDir, 0755, true);
}



$userFilePath = $userDir . $newFileName;


// Move the file to the user's directory
if (!file_exists($userFilePath)) {
    move_uploaded_file($_FILES['fileContent']['tmp_name'], $userFilePath);
}

// Return the URL of the rehosted file
if ($version) {
    echo $storagePath . $user_id . '/' . $fileName . '/' . $newFileName;
} else {
    echo $storagePath . $user_id . '/' . $newFileName;
}
?>