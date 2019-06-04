//
//  utils.cpp
//  QRCode-cpp
//
//  Created by wangzeyu on 10/24/17.
//  Copyright © 2017 wangzeyu. All rights reserved.
//

#include "utils.hpp"

Point2f toCvPoint(Ref<ResultPoint> resultPoint) {
    return Point2f(resultPoint->getX(), resultPoint->getY());
}

Mat back_layer_ROI(Mat src, Mat front_mask, Mat dst) {
    for (int row = 0; row < src.rows; row++) {
        for (int col = 0; col < src.cols; col++) {
            if (front_mask.at<uchar>(row, col) > 0) {
                dst.at<Vec3b>(row, col) = src.at<Vec3b>(row, col);
            }
        }
    }
    return dst;
}
