//
//  utils.hpp
//  QRCode-cpp
//
//  Created by wangzeyu on 10/24/17.
//  Copyright © 2017 wangzeyu. All rights reserved.
//

#ifndef utils_hpp
#define utils_hpp


#include <zxing/Result.h>
#include <opencv2/core/core.hpp>
using namespace cv;
using namespace zxing;

Point2f toCvPoint(Ref<ResultPoint> resultPoint);

Mat back_layer_ROI(Mat src, Mat front_mask, Mat dst);

#endif /* utils_hpp */
